//! Tests for `studio.src-tauri.crates.engine-supervisor.engine-process`.
//! Each name starts with `engine_process_` until the trace check reads
//! `cargo test`. The engine is a test thread on in-memory pipes.

use std::io::{self, PipeReader, PipeWriter, Write, pipe};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use halonic_engine_pipe::{PipeFault, RoutinePause, SandboxHost, read_frame, sandbox_host_json};
use halonic_engine_supervisor::{
    EngineChild, EngineProcess, LinkEnd, LinkWatcher, OpenError, RESTART_WINDOW, RestartLimit,
    StartError, Stopped,
};
use halonic_secret_broker::{SecretBroker, WorkspaceTrust};
use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};

const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const WAIT: Duration = Duration::from_secs(5);
const HEALTH: &str = r#"{"kind":"health","scheduling":true,"paused":false,"activeRuns":0,"runsWaiting":0,"lastTick":null,"nextRoutineAt":null}"#;

/// The test's end of the engine's pipes.
struct FakeEngine {
    output: PipeWriter,
    input: PipeReader,
    exited: Arc<AtomicBool>,
    killed: Arc<AtomicBool>,
}

impl FakeEngine {
    fn send(&mut self, json: &str) {
        let length = u32::try_from(json.len()).unwrap().to_be_bytes();
        self.output.write_all(&length).unwrap();
        self.output.write_all(json.as_bytes()).unwrap();
    }

    fn handshake(&mut self) {
        self.send(&format!(
            r#"{{"kind":"handshake","protocol":1,"url":"http://127.0.0.1:4100","token":"{TOKEN}"}}"#
        ));
    }

    /// The next frame the shell wrote, or `None` once it closed the input.
    fn read(&mut self) -> Option<String> {
        read_frame(&mut self.input)
            .unwrap()
            .map(|json| String::from_utf8(json).unwrap())
    }
}

struct FakeChild {
    exited: Arc<AtomicBool>,
    killed: Arc<AtomicBool>,
}

impl EngineChild for FakeChild {
    fn has_exited(&mut self) -> bool {
        self.exited.load(Ordering::SeqCst)
    }

    fn kill(&mut self) {
        self.killed.store(true, Ordering::SeqCst);
        self.exited.store(true, Ordering::SeqCst);
    }
}

struct Trusted;

impl WorkspaceTrust for Trusted {
    fn is_trusted(&self) -> Result<bool, String> {
        Ok(true)
    }
}

/// Hands each way a link ended, and each new health, to the test.
struct Ends {
    ends: Mutex<Sender<LinkEnd>>,
    healths: Mutex<Sender<()>>,
}

impl LinkWatcher for Ends {
    fn health_changed(&self) {
        let sender = self.healths.lock().unwrap_or_else(PoisonError::into_inner);
        let _test_may_have_ended = sender.send(());
    }

    fn ended(&self, end: LinkEnd) {
        let sender = self.ends.lock().unwrap_or_else(PoisonError::into_inner);
        let _test_may_have_ended = sender.send(end);
    }
}

/// An engine's input that takes no write, as from an engine that stopped
/// reading, until the test drops `gate`.
struct UnreadInput {
    entered: Sender<()>,
    gate: Receiver<()>,
}

impl Write for UnreadInput {
    fn write(&mut self, _buffer: &[u8]) -> io::Result<usize> {
        let _test_may_have_ended = self.entered.send(());
        let _gate_dropped = self.gate.recv();
        Err(io::ErrorKind::BrokenPipe.into())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn broker_over(backend: Arc<dyn SecretBackend>) -> SecretBroker {
    SecretBroker::with_timeout(backend, Arc::new(Trusted), WAIT)
}

fn acme_broker() -> SecretBroker {
    let backend = MemoryBackend::new();
    backend
        .set(&SecretName::parse("acme_key").unwrap(), "acme-value")
        .unwrap();
    broker_over(Arc::new(backend))
}

/// A started link, and what the test hears from it.
struct Attached {
    started: Result<EngineProcess, StartError>,
    engine_done: Receiver<FakeEngine>,
    ended: Receiver<LinkEnd>,
    healths: Receiver<()>,
}

/// Starts a link to a fake engine, which `before` drives until the shell
/// has read what it needs.
fn attach(
    broker: SecretBroker,
    wait: Duration,
    before: impl FnOnce(&mut FakeEngine) + Send + 'static,
) -> Attached {
    let (input, input_writer) = pipe().unwrap();
    attach_writing_to(input_writer, input, broker, wait, before)
}

/// [`attach`], with the shell writing to `shell_input` rather than to the
/// pipe the fake engine reads.
fn attach_writing_to(
    shell_input: impl Write + Send + 'static,
    input: PipeReader,
    broker: SecretBroker,
    wait: Duration,
    before: impl FnOnce(&mut FakeEngine) + Send + 'static,
) -> Attached {
    let (output_reader, output) = pipe().unwrap();
    let (exited, killed) = (Arc::default(), Arc::<AtomicBool>::default());
    let child = FakeChild {
        exited: Arc::clone(&exited),
        killed: Arc::clone(&killed),
    };
    let mut engine = FakeEngine {
        output,
        input,
        exited,
        killed,
    };
    let (engine_back, engine_done) = channel();
    std::thread::spawn(move || {
        before(&mut engine);
        let _test_may_have_ended = engine_back.send(engine);
    });
    let (ends, ended) = channel();
    let (health_sender, healths) = channel();
    let watcher = Arc::new(Ends {
        ends: Mutex::new(ends),
        healths: Mutex::new(health_sender),
    });
    let started = EngineProcess::attach(
        Box::new(child),
        output_reader,
        shell_input,
        broker,
        wait,
        watcher,
    );
    Attached {
        started,
        engine_done,
        ended,
        healths,
    }
}

#[test]
fn engine_process_opens_on_the_handshake_and_answers_a_secret() {
    let attached = attach(acme_broker(), WAIT, |engine| {
        engine.handshake();
        engine.send(r#"{"kind":"secret_get","id":1,"name":"acme_key"}"#);
        let answer = engine.read();
        assert_eq!(
            answer.as_deref(),
            Some(r#"{"kind":"secret_answer","id":1,"result":"value","value":"acme-value"}"#)
        );
    });
    let process = attached.started.unwrap();
    assert_eq!(process.link().handshake().url(), "http://127.0.0.1:4100");
    let engine = attached.engine_done.recv_timeout(WAIT).unwrap();
    engine.exited.store(true, Ordering::SeqCst);
}

#[test]
fn engine_process_gives_up_without_a_handshake_and_kills_the_engine() {
    let attached = attach(acme_broker(), Duration::from_millis(50), |_| {});
    let engine = attached.engine_done.recv_timeout(WAIT).unwrap();
    assert!(matches!(
        attached.started,
        Err(StartError::Open(OpenError::Timeout))
    ));
    assert!(engine.killed.load(Ordering::SeqCst));
}

#[test]
fn engine_process_kills_the_engine_on_a_fault() {
    let attached = attach(acme_broker(), WAIT, |engine| {
        engine.handshake();
        engine.send(HEALTH);
        engine.send(r#"{"kind":"secret_set","id":1,"name":"acme_key","value":"x"}"#);
    });
    let _process = attached.started.unwrap();
    let mut engine = attached.engine_done.recv_timeout(WAIT).unwrap();
    let end = attached.ended.recv_timeout(WAIT).unwrap();
    assert_eq!(end, LinkEnd::Fault(PipeFault::NotAMessage));
    assert!(engine.killed.load(Ordering::SeqCst));
    assert_eq!(engine.read(), None, "the engine's input is closed");
}

#[test]
fn engine_process_stops_on_stop() {
    let attached = attach(acme_broker(), WAIT, |engine| {
        engine.handshake();
        engine.send(HEALTH);
        assert_eq!(engine.read().as_deref(), Some(r#"{"kind":"stop"}"#));
        engine.send(r#"{"kind":"stopped","interrupted":2}"#);
        engine.exited.store(true, Ordering::SeqCst);
    });
    let process = attached.started.unwrap();
    // After its health the shell waits for the next frame, which is when a
    // Quit comes: `stop` is sent while the reader waits.
    attached.healths.recv_timeout(WAIT).unwrap();
    assert_eq!(process.stop(WAIT), Stopped::Exited);
    let end = attached.ended.recv_timeout(WAIT).unwrap();
    assert_eq!(end, LinkEnd::Stopped { interrupted: 2 });
}

#[test]
fn engine_process_kills_an_engine_that_has_stopped_reading() {
    let (entered, writing) = channel();
    let (gate, gate_receiver) = channel::<()>();
    let unread = UnreadInput {
        entered,
        gate: gate_receiver,
    };
    let (input, _input_writer) = pipe().unwrap();
    let attached = attach_writing_to(unread, input, acme_broker(), WAIT, |engine| {
        engine.handshake();
        engine.send(r#"{"kind":"secret_get","id":1,"name":"acme_key"}"#);
    });
    let process = attached.started.unwrap();
    // The answer's write waits on the engine for good.
    writing.recv_timeout(WAIT).unwrap();
    let (stopped_sender, stopped) = channel();
    std::thread::spawn(move || {
        let _test_may_have_ended = stopped_sender.send(process.stop(Duration::from_millis(100)));
    });
    assert_eq!(stopped.recv_timeout(WAIT).unwrap(), Stopped::Killed);
    let engine = attached.engine_done.recv_timeout(WAIT).unwrap();
    assert!(engine.killed.load(Ordering::SeqCst));
    drop(gate);
}

#[test]
fn engine_process_kills_an_engine_that_doesnt_stop() {
    let attached = attach(acme_broker(), WAIT, |engine| {
        engine.handshake();
    });
    let process = attached.started.unwrap();
    let engine = attached.engine_done.recv_timeout(WAIT).unwrap();
    let asked = Instant::now();
    assert_eq!(process.stop(Duration::from_millis(100)), Stopped::Killed);
    assert!(asked.elapsed() >= Duration::from_millis(100));
    assert!(engine.killed.load(Ordering::SeqCst));
}

#[test]
fn engine_process_answers_busy_beyond_the_queue() {
    let (backend, entered, gate) = GatedBackend::closed();
    let attached = attach(broker_over(backend), WAIT, move |engine| {
        engine.handshake();
        engine.send(r#"{"kind":"secret_get","id":1,"name":"acme_key"}"#);
        // The first request is in the keychain; 15 more make 16 open.
        entered.recv_timeout(WAIT).unwrap();
        for id in 2..=17 {
            engine.send(&format!(
                r#"{{"kind":"secret_get","id":{id},"name":"acme_key"}}"#
            ));
        }
        let first_answer = engine.read();
        assert_eq!(
            first_answer.as_deref(),
            Some(r#"{"kind":"secret_answer","id":17,"result":"refused","reason":"busy"}"#)
        );
    });
    let _process = attached.started.unwrap();
    let engine = attached.engine_done.recv_timeout(WAIT).unwrap();
    engine.exited.store(true, Ordering::SeqCst);
    drop(gate);
}

/// HAL-17184: every launch, a first start's or a restart's, hears where the
/// sandbox host is and the user's Pause routines right after its handshake.
#[test]
fn engine_process_sends_the_host_and_the_pause_after_every_handshake() {
    let host = SandboxHost {
        url: "http://127.0.0.1:4200",
        token: TOKEN,
    };
    let mut paused = RoutinePause::default();
    let _frame = paused.set(true);
    let launches = [
        (
            Some(host),
            RoutinePause::default(),
            sandbox_host_json(Some(host)),
        ),
        (None, paused, sandbox_host_json(None)),
    ];
    for (host, pause, host_frame) in launches {
        let expected = [
            String::from_utf8(host_frame).unwrap(),
            String::from_utf8(pause.after_handshake()).unwrap(),
        ];
        let attached = attach(acme_broker(), WAIT, move |engine| {
            engine.handshake();
            assert_eq!(engine.read().as_deref(), Some(expected[0].as_str()));
            assert_eq!(engine.read().as_deref(), Some(expected[1].as_str()));
        });
        let process = attached.started.unwrap();
        process.link().send_after_handshake(host, pause).unwrap();
        let engine = attached.engine_done.recv_timeout(WAIT).unwrap();
        engine.exited.store(true, Ordering::SeqCst);
    }
}

/// HAL-17185: Pause routines the user sets while an engine runs reaches it
/// at once, after what it heard at its handshake.
#[test]
fn engine_process_sends_a_pause_that_changes_while_it_runs() {
    let mut pause = RoutinePause::default();
    let paused = String::from_utf8(pause.set(true)).unwrap();
    let resumed = String::from_utf8(pause.set(false)).unwrap();
    let no_host = String::from_utf8(sandbox_host_json(None)).unwrap();
    let attached = attach(acme_broker(), WAIT, move |engine| {
        engine.handshake();
        assert_eq!(engine.read().as_deref(), Some(no_host.as_str()));
        assert_eq!(engine.read().as_deref(), Some(resumed.as_str()));
        assert_eq!(engine.read().as_deref(), Some(paused.as_str()));
        assert_eq!(engine.read().as_deref(), Some(resumed.as_str()));
    });
    let process = attached.started.unwrap();
    let link = process.link();
    link.send_after_handshake(None, RoutinePause::default())
        .unwrap();
    let mut pause = RoutinePause::default();
    let _frame = pause.set(true);
    link.send_pause_routines(pause).unwrap();
    let _frame = pause.set(false);
    link.send_pause_routines(pause).unwrap();
    let engine = attached.engine_done.recv_timeout(WAIT).unwrap();
    engine.exited.store(true, Ordering::SeqCst);
}

#[test]
fn engine_process_restarts_at_most_three_times_in_five_minutes() {
    let start = Instant::now();
    let mut limit = RestartLimit::default();
    for minute in 0..3 {
        assert!(limit.may_restart(start + Duration::from_secs(60 * minute)));
    }
    assert!(!limit.may_restart(start + Duration::from_secs(4 * 60)));
    assert!(limit.may_restart(start + RESTART_WINDOW));
}

/// A keychain whose reads wait until the test drops the gate.
struct GatedBackend {
    entered: Mutex<Sender<()>>,
    gate: Mutex<Receiver<()>>,
}

impl GatedBackend {
    fn closed() -> (Arc<Self>, Receiver<()>, Sender<()>) {
        let (entered, entered_reports) = channel();
        let (gate_opener, gate) = channel();
        let backend = Self {
            entered: Mutex::new(entered),
            gate: Mutex::new(gate),
        };
        (Arc::new(backend), entered_reports, gate_opener)
    }
}

impl SecretBackend for GatedBackend {
    fn get(&self, _name: &SecretName) -> Result<Option<String>, SecretError> {
        let entered = self.entered.lock().unwrap_or_else(PoisonError::into_inner);
        let _test_may_have_ended = entered.send(());
        drop(entered);
        let gate = self.gate.lock().unwrap_or_else(PoisonError::into_inner);
        let _opened_or_closed = gate.recv();
        Ok(None)
    }

    fn set(&self, _name: &SecretName, _value: &str) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }

    fn delete(&self, _name: &SecretName) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }

    fn get_origins(&self, _name: &SecretName) -> Result<Option<String>, SecretError> {
        Ok(None)
    }

    fn set_origins(&self, _name: &SecretName, _origins: &str) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }

    fn delete_origins(&self, _name: &SecretName) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }
}
