//! Tests for `studio.src-tauri.crates.engine-supervisor.engine-process`.
//! Each name starts with `engine_process_` until the trace check reads
//! `cargo test`. The engine is a test thread on in-memory pipes.

use std::io::{PipeReader, PipeWriter, Write, pipe};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use halonic_engine_pipe::{PipeFault, read_frame};
use halonic_engine_supervisor::{
    EngineChild, EngineProcess, LinkEnd, LinkWatcher, OpenError, RESTART_WINDOW, RestartLimit,
    StartError, Stopped,
};
use halonic_secret_broker::{SecretBroker, WorkspaceTrust};
use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};

const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const WAIT: Duration = Duration::from_secs(5);

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

/// Hands each way a link ended to the test.
struct Ends(Mutex<Sender<LinkEnd>>);

impl LinkWatcher for Ends {
    fn ended(&self, end: LinkEnd) {
        let sender = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        let _test_may_have_ended = sender.send(end);
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

/// Starts a link to a fake engine, which `before` drives until the shell
/// has read what it needs.
fn attach(
    broker: SecretBroker,
    wait: Duration,
    before: impl FnOnce(&mut FakeEngine) + Send + 'static,
) -> (
    Result<EngineProcess, StartError>,
    Receiver<FakeEngine>,
    Receiver<LinkEnd>,
) {
    let (output_reader, output) = pipe().unwrap();
    let (input, input_writer) = pipe().unwrap();
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
    let watcher = Arc::new(Ends(Mutex::new(ends)));
    let started = EngineProcess::attach(
        Box::new(child),
        output_reader,
        input_writer,
        broker,
        wait,
        watcher,
    );
    (started, engine_done, ended)
}

#[test]
fn engine_process_opens_on_the_handshake_and_answers_a_secret() {
    let (started, engine_done, _ended) = attach(acme_broker(), WAIT, |engine| {
        engine.handshake();
        engine.send(r#"{"kind":"secret_get","id":1,"name":"acme_key"}"#);
        let answer = engine.read();
        assert_eq!(
            answer.as_deref(),
            Some(r#"{"kind":"secret_answer","id":1,"result":"value","value":"acme-value"}"#)
        );
    });
    let process = started.unwrap();
    assert_eq!(process.link().handshake().url(), "http://127.0.0.1:4100");
    let engine = engine_done.recv_timeout(WAIT).unwrap();
    engine.exited.store(true, Ordering::SeqCst);
}

#[test]
fn engine_process_gives_up_without_a_handshake_and_kills_the_engine() {
    let (started, engine_done, _ended) = attach(acme_broker(), Duration::from_millis(50), |_| {});
    let engine = engine_done.recv_timeout(WAIT).unwrap();
    assert!(matches!(started, Err(StartError::Open(OpenError::Timeout))));
    assert!(engine.killed.load(Ordering::SeqCst));
}

#[test]
fn engine_process_kills_the_engine_on_a_fault() {
    let (started, engine_done, ended) = attach(acme_broker(), WAIT, |engine| {
        engine.handshake();
        engine.send(r#"{"kind":"health","scheduling":true,"activeRuns":0,"lastTick":null}"#);
        engine.send(r#"{"kind":"secret_set","id":1,"name":"acme_key","value":"x"}"#);
    });
    let _process = started.unwrap();
    let mut engine = engine_done.recv_timeout(WAIT).unwrap();
    let end = ended.recv_timeout(WAIT).unwrap();
    assert_eq!(end, LinkEnd::Fault(PipeFault::NotAMessage));
    assert!(engine.killed.load(Ordering::SeqCst));
    assert_eq!(engine.read(), None, "the engine's input is closed");
}

#[test]
fn engine_process_stops_on_stop() {
    let (started, _engine_done, ended) = attach(acme_broker(), WAIT, |engine| {
        engine.handshake();
        assert_eq!(engine.read().as_deref(), Some(r#"{"kind":"stop"}"#));
        engine.send(r#"{"kind":"stopped","interrupted":2}"#);
        engine.exited.store(true, Ordering::SeqCst);
    });
    let process = started.unwrap();
    assert_eq!(process.stop(WAIT), Stopped::Exited);
    let end = ended.recv_timeout(WAIT).unwrap();
    assert_eq!(end, LinkEnd::Stopped { interrupted: 2 });
}

#[test]
fn engine_process_kills_an_engine_that_doesnt_stop() {
    let (started, engine_done, _ended) = attach(acme_broker(), WAIT, |engine| {
        engine.handshake();
    });
    let process = started.unwrap();
    let engine = engine_done.recv_timeout(WAIT).unwrap();
    let asked = Instant::now();
    assert_eq!(process.stop(Duration::from_millis(100)), Stopped::Killed);
    assert!(asked.elapsed() >= Duration::from_millis(100));
    assert!(engine.killed.load(Ordering::SeqCst));
}

#[test]
fn engine_process_answers_busy_beyond_the_queue() {
    let (backend, entered, gate) = GatedBackend::closed();
    let (started, engine_done, _ended) = attach(broker_over(backend), WAIT, move |engine| {
        engine.handshake();
        engine.send(r#"{"kind":"secret_get","id":1,"name":"acme_key"}"#);
        // The first request is in the keychain; 16 fill the queue.
        entered.recv_timeout(WAIT).unwrap();
        for id in 2..=18 {
            engine.send(&format!(
                r#"{{"kind":"secret_get","id":{id},"name":"acme_key"}}"#
            ));
        }
        let first_answer = engine.read();
        assert_eq!(
            first_answer.as_deref(),
            Some(r#"{"kind":"secret_answer","id":18,"result":"refused","reason":"busy"}"#)
        );
    });
    let _process = started.unwrap();
    let engine = engine_done.recv_timeout(WAIT).unwrap();
    engine.exited.store(true, Ordering::SeqCst);
    drop(gate);
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
