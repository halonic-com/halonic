use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, SyncSender, TrySendError};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use halonic_agent_host::Handshake;
use halonic_engine_pipe::{
    EngineEvent, EngineHealth, MAX_SHELL_FRAME_BYTES, PipeFault, PipeSession, SandboxHost,
    read_frame, sandbox_host_json, secret_answer_json, stop_json, write_frame,
};
use halonic_secret_broker::{
    BrokerAnswer, BrokerRefusal, BrokerRequest, MAX_OUTSTANDING, SecretBroker,
};

/// How the link to an engine ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkEnd {
    /// The engine sent `stopped` after the shell's `stop`.
    Stopped { interrupted: u32 },
    /// The engine closed its output without `stopped`: it exited or crashed.
    Closed,
    /// The engine broke the protocol.
    Fault(PipeFault),
}

/// Why the link didn't open.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenError {
    /// No handshake within the wait.
    Timeout,
    /// The engine closed its output before the handshake.
    Closed,
    /// The engine broke the protocol before or in the handshake.
    Fault(PipeFault),
}

/// What the shell learns from a link while it runs. Called on the link's
/// reader thread, so neither may block for long.
pub trait LinkWatcher: Send + Sync + 'static {
    /// The engine sent a new `health`.
    fn health_changed(&self) {}
    /// The link ended. The engine's input is closed by then.
    fn ended(&self, _end: LinkEnd) {}
}

/// Frames for the engine wait here for the thread that writes them: the
/// answers to the most requests it may have open, with room for `busy`,
/// `stop` and `sandbox_host` beside them.
const INPUT_QUEUE: usize = 2 * MAX_OUTSTANDING;

/// The way to the thread that owns the engine's input. Sending never
/// blocks, so this lock is never held while a write waits on an engine
/// that stopped reading; `None` once the input is closed.
type Input = Arc<Mutex<Option<SyncSender<Vec<u8>>>>>;

#[derive(Default)]
struct Status {
    health: Option<EngineHealth>,
    end: Option<LinkEnd>,
}

/// The shell's link to one running engine: its handshake, its health, and
/// the way to send it frames. A thread of its own reads the engine's output.
pub struct EngineLink {
    input: Input,
    status: Arc<Mutex<Status>>,
    stop_sent: Arc<AtomicBool>,
    handshake: Handshake,
}

impl EngineLink {
    /// Reads the engine's `output` on a thread of its own and waits up to
    /// `wait` for its handshake. After it, broker requests are answered from
    /// `broker` on one more thread, with at most [`MAX_OUTSTANDING`] open; a
    /// request beyond them is answered `busy`. One more thread writes to
    /// `input`.
    ///
    /// # Errors
    ///
    /// An [`OpenError`]; the engine's input is closed then.
    pub fn open(
        output: impl Read + Send + 'static,
        input: impl Write + Send + 'static,
        broker: SecretBroker,
        wait: Duration,
        watcher: Arc<dyn LinkWatcher>,
    ) -> Result<Self, OpenError> {
        let input = start_writer(input);
        let reader = Reader {
            input: Arc::clone(&input),
            status: Arc::default(),
            stop_sent: Arc::default(),
            watcher,
        };
        let (status, stop_sent) = (Arc::clone(&reader.status), Arc::clone(&reader.stop_sent));
        let (opened, opening) = mpsc::sync_channel(1);
        let spawned = thread::Builder::new()
            .name("engine-pipe".to_owned())
            .spawn(move || reader.run(output, broker, &opened));
        let answer = match spawned {
            Ok(_) => opening
                .recv_timeout(wait)
                .unwrap_or(Err(OpenError::Timeout)),
            Err(_) => Err(OpenError::Closed),
        };
        match answer {
            Ok(handshake) => Ok(Self {
                input,
                status,
                stop_sent,
                handshake,
            }),
            Err(error) => {
                close(&input);
                Err(error)
            }
        }
    }

    /// Where the engine serves and its token.
    pub fn handshake(&self) -> &Handshake {
        &self.handshake
    }

    /// The engine's last health, `None` before its first.
    pub fn health(&self) -> Option<EngineHealth> {
        lock(&self.status).health.clone()
    }

    /// How the link ended, `None` while it runs.
    pub fn end(&self) -> Option<LinkEnd> {
        lock(&self.status).end
    }

    /// Sends `stop`.
    ///
    /// # Errors
    ///
    /// [`PipeFault::Write`] when the input is closed or its queue is full.
    pub fn send_stop(&self) -> Result<(), PipeFault> {
        // Noted before the frame goes, so the reader takes the `stopped`
        // that answers it.
        self.stop_sent.store(true, Ordering::SeqCst);
        send(&self.input, stop_json())
    }

    /// Sends where the sandbox host is now, or that none runs.
    ///
    /// # Errors
    ///
    /// [`PipeFault::Write`] when the input is closed or its queue is full.
    pub fn send_sandbox_host(&self, host: Option<SandboxHost<'_>>) -> Result<(), PipeFault> {
        send(&self.input, sandbox_host_json(host))
    }

    /// Closes the engine's input: it stops, and exits, when it reads the end.
    /// Frames already queued are still written first.
    pub fn close_input(&self) {
        close(&self.input);
    }
}

struct Reader {
    input: Input,
    status: Arc<Mutex<Status>>,
    stop_sent: Arc<AtomicBool>,
    watcher: Arc<dyn LinkWatcher>,
}

impl Reader {
    fn run(
        self,
        mut output: impl Read,
        broker: SecretBroker,
        opened: &SyncSender<Result<Handshake, OpenError>>,
    ) {
        let mut session = PipeSession::default();
        let first = first_frame(&mut output, &mut session);
        let failed = first.is_err();
        // The opener may have stopped waiting; then the link isn't used.
        if opened.send(first).is_err() || failed {
            close(&self.input);
            return;
        }
        let answers = Answers::start(broker, Arc::clone(&self.input));
        let end = self.read_on(&mut output, &mut session, &answers);
        // Closed before the queue goes, so the requests left in it aren't
        // taken to the keychain for an engine that is gone or faulty.
        close(&self.input);
        drop(answers);
        if let LinkEnd::Fault(fault) = end {
            halonic_shell_log::record("engine", fault);
        }
        lock(&self.status).end = Some(end);
        self.watcher.ended(end);
    }

    fn read_on(
        &self,
        output: &mut impl Read,
        session: &mut PipeSession,
        answers: &Answers,
    ) -> LinkEnd {
        loop {
            let json = match read_frame(output) {
                Ok(Some(json)) => json,
                Ok(None) => return LinkEnd::Closed,
                Err(fault) => return LinkEnd::Fault(fault),
            };
            // Read after the frame came, not before the wait for it: `stop`
            // is usually sent while this thread waits, and the flag is set
            // before `stop` goes, so it is set when `stopped` arrives.
            if self.stop_sent.load(Ordering::SeqCst) {
                session.stop_sent();
            }
            match session.accept(&json, Instant::now()) {
                Ok(EngineEvent::Request { id, request }) => answers.queue(id, request),
                Ok(EngineEvent::Health(health)) => {
                    lock(&self.status).health = Some(health);
                    self.watcher.health_changed();
                }
                Ok(EngineEvent::Dropped) => {}
                Ok(EngineEvent::Stopped { interrupted }) => {
                    return LinkEnd::Stopped { interrupted };
                }
                // The session refuses a second handshake; this can't come.
                Ok(EngineEvent::Handshake(_)) => {
                    return LinkEnd::Fault(PipeFault::SecondHandshake);
                }
                Err(fault) => return LinkEnd::Fault(fault),
            }
        }
    }
}

fn first_frame(output: &mut impl Read, session: &mut PipeSession) -> Result<Handshake, OpenError> {
    let json = match read_frame(output) {
        Ok(Some(json)) => json,
        Ok(None) => return Err(OpenError::Closed),
        Err(fault) => return Err(OpenError::Fault(fault)),
    };
    match session.accept(&json, Instant::now()) {
        Ok(EngineEvent::Handshake(handshake)) => Ok(handshake),
        Ok(_) => Err(OpenError::Fault(PipeFault::BeforeHandshake)),
        Err(fault) => Err(OpenError::Fault(fault)),
    }
}

/// The broker's queue: one thread answers in order, since the keychain takes
/// one call at a time anyway. The one it answers and those waiting make at
/// most [`MAX_OUTSTANDING`].
struct Answers {
    queue: SyncSender<(u64, BrokerRequest)>,
    input: Input,
    /// Whether an answer that couldn't be sent was logged: once per link,
    /// so an engine that stops reading but keeps asking can't flood the log.
    unsent_logged: Arc<AtomicBool>,
}

impl Answers {
    fn start(broker: SecretBroker, input: Input) -> Self {
        let (queue, requests) = mpsc::sync_channel::<(u64, BrokerRequest)>(MAX_OUTSTANDING - 1);
        let writer = Arc::clone(&input);
        let unsent_logged = Arc::new(AtomicBool::new(false));
        let writer_logged = Arc::clone(&unsent_logged);
        let spawned = thread::Builder::new()
            .name("engine-secrets".to_owned())
            .spawn(move || {
                for (id, request) in requests {
                    // Once the link ended nobody reads the answer.
                    if lock(&writer).is_none() {
                        continue;
                    }
                    write_answer(&writer, &writer_logged, id, &broker.answer(&request));
                }
            });
        if spawned.is_err() {
            // The queue's receiver is gone with the closure: every request
            // is answered `unavailable` below.
            halonic_shell_log::record("engine", "the secret answering thread didn't start");
        }
        Self {
            queue,
            input,
            unsent_logged,
        }
    }

    fn queue(&self, id: u64, request: BrokerRequest) {
        let refused = match self.queue.try_send((id, request)) {
            Ok(()) => return,
            Err(TrySendError::Full(_)) => BrokerRefusal::Busy,
            Err(TrySendError::Disconnected(_)) => BrokerRefusal::Unavailable,
        };
        let answer = BrokerAnswer::Refused { reason: refused };
        write_answer(&self.input, &self.unsent_logged, id, &answer);
    }
}

/// Queues one answer. One that can't go (the input is closed, or its queue
/// is full because the engine stopped reading) is logged only the first
/// time on this link.
fn write_answer(input: &Input, unsent_logged: &AtomicBool, id: u64, answer: &BrokerAnswer) {
    if let Err(fault) = send(input, secret_answer_json(id, answer))
        && !unsent_logged.swap(true, Ordering::SeqCst)
    {
        halonic_shell_log::record(
            "engine",
            format_args!("an answer wasn't sent, and later ones aren't logged: {fault}"),
        );
    }
}

/// Starts the thread that owns the engine's input. It ends, and closes the
/// input, when the queue's senders are gone and the queue is written, or
/// when a write fails because the engine is gone.
fn start_writer(mut input: impl Write + Send + 'static) -> Input {
    let (frames, queued) = mpsc::sync_channel::<Vec<u8>>(INPUT_QUEUE);
    let spawned = thread::Builder::new()
        .name("engine-input".to_owned())
        .spawn(move || {
            for json in queued {
                if let Err(fault) = write_frame(&mut input, &json) {
                    halonic_shell_log::record("engine", format_args!("its input ended: {fault}"));
                    return;
                }
            }
        });
    if spawned.is_err() {
        // The input went with the closure: the engine reads its end, and
        // every send below is refused.
        halonic_shell_log::record("engine", "the thread for its input didn't start");
    }
    Arc::new(Mutex::new(Some(frames)))
}

/// Queues `json` for the engine without waiting. Its length is checked here,
/// so the writing thread meets only write errors.
fn send(input: &Input, json: Vec<u8>) -> Result<(), PipeFault> {
    if json.is_empty() || json.len() > MAX_SHELL_FRAME_BYTES {
        return Err(PipeFault::Length);
    }
    match lock(input).as_ref() {
        Some(frames) => frames.try_send(json).map_err(|_| PipeFault::Write),
        None => Err(PipeFault::Write),
    }
}

fn close(input: &Input) {
    drop(lock(input).take());
}

/// The data behind these locks stays whole if a holder panicked: an
/// optional sender and two plain fields.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicBool;
    use std::sync::{Arc, Mutex};

    use halonic_secret_broker::{BrokerAnswer, BrokerRefusal};

    use super::{Input, write_answer};

    /// The only test in this binary that writes the shell's log, which is
    /// one per process.
    #[test]
    fn engine_process_logs_unsent_answers_once_per_link() {
        let folder = std::env::temp_dir().join(format!("acme-unsent-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let log = folder.join("shell.log");
        halonic_shell_log::start(log.clone());
        let closed: Input = Arc::new(Mutex::new(None));
        let logged = AtomicBool::new(false);
        let busy = BrokerAnswer::Refused {
            reason: BrokerRefusal::Busy,
        };

        for id in 1..=20 {
            write_answer(&closed, &logged, id, &busy);
        }

        let text = std::fs::read_to_string(&log).unwrap();
        std::fs::remove_dir_all(&folder).unwrap();
        assert_eq!(text.matches("an answer wasn't sent").count(), 1, "{text}");
    }
}
