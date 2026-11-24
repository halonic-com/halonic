use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, SyncSender, TrySendError};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use halonic_agent_host::Handshake;
use halonic_engine_pipe::{
    EngineEvent, EngineHealth, PipeFault, PipeSession, SandboxHost, read_frame, sandbox_host_json,
    secret_answer_json, stop_json, write_frame,
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
    /// The link ended. On a fault the engine's input is closed right after.
    fn ended(&self, _end: LinkEnd) {}
}

type Input = Arc<Mutex<Option<Box<dyn Write + Send>>>>;

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
    /// `broker` on one more thread, in a queue of at most
    /// [`MAX_OUTSTANDING`]; a request beyond it is answered `busy`.
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
        let input: Input = Arc::new(Mutex::new(Some(Box::new(input))));
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
    /// [`PipeFault::Write`] when the input is closed or writing fails.
    pub fn send_stop(&self) -> Result<(), PipeFault> {
        // Noted before the frame goes, so the reader takes the `stopped`
        // that answers it.
        self.stop_sent.store(true, Ordering::SeqCst);
        send(&self.input, &stop_json())
    }

    /// Sends where the sandbox host is now, or that none runs.
    ///
    /// # Errors
    ///
    /// [`PipeFault::Write`] when the input is closed or writing fails.
    pub fn send_sandbox_host(&self, host: Option<SandboxHost<'_>>) -> Result<(), PipeFault> {
        send(&self.input, &sandbox_host_json(host))
    }

    /// Closes the engine's input: it stops, and exits, when it reads the end.
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
        drop(answers);
        if let LinkEnd::Fault(fault) = end {
            halonic_shell_log::record("engine", fault);
        }
        lock(&self.status).end = Some(end);
        // The watcher kills a faulty engine first: a write to an engine
        // that stopped reading can hold the input's lock until then.
        self.watcher.ended(end);
        if matches!(end, LinkEnd::Fault(_)) {
            close(&self.input);
        }
    }

    fn read_on(
        &self,
        output: &mut impl Read,
        session: &mut PipeSession,
        answers: &Answers,
    ) -> LinkEnd {
        loop {
            if self.stop_sent.load(Ordering::SeqCst) {
                session.stop_sent();
            }
            let json = match read_frame(output) {
                Ok(Some(json)) => json,
                Ok(None) => return LinkEnd::Closed,
                Err(fault) => return LinkEnd::Fault(fault),
            };
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
/// one call at a time anyway.
struct Answers {
    queue: SyncSender<(u64, BrokerRequest)>,
    input: Input,
}

impl Answers {
    fn start(broker: SecretBroker, input: Input) -> Self {
        let (queue, requests) = mpsc::sync_channel::<(u64, BrokerRequest)>(MAX_OUTSTANDING);
        let writer = Arc::clone(&input);
        let spawned = thread::Builder::new()
            .name("engine-secrets".to_owned())
            .spawn(move || {
                for (id, request) in requests {
                    write_answer(&writer, id, &broker.answer(&request));
                }
            });
        if spawned.is_err() {
            // The queue's receiver is gone with the closure: every request
            // is answered `unavailable` below.
            halonic_shell_log::record("engine", "the secret answering thread didn't start");
        }
        Self { queue, input }
    }

    fn queue(&self, id: u64, request: BrokerRequest) {
        let refused = match self.queue.try_send((id, request)) {
            Ok(()) => return,
            Err(TrySendError::Full(_)) => BrokerRefusal::Busy,
            Err(TrySendError::Disconnected(_)) => BrokerRefusal::Unavailable,
        };
        write_answer(&self.input, id, &BrokerAnswer::Refused { reason: refused });
    }
}

fn write_answer(input: &Input, id: u64, answer: &BrokerAnswer) {
    if let Err(fault) = send(input, &secret_answer_json(id, answer)) {
        halonic_shell_log::record("engine", format_args!("an answer wasn't sent: {fault}"));
    }
}

fn send(input: &Input, json: &[u8]) -> Result<(), PipeFault> {
    match lock(input).as_mut() {
        Some(writer) => write_frame(writer, json),
        None => Err(PipeFault::Write),
    }
}

fn close(input: &Input) {
    drop(lock(input).take());
}

/// The data behind these locks stays whole if a holder panicked: an
/// optional writer and two plain fields.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}
