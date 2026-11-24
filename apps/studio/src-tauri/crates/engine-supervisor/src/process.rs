use std::fmt;
use std::io::{Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use halonic_agent_host::log_stderr;
use halonic_secret_broker::SecretBroker;

use crate::link::{EngineLink, LinkEnd, LinkWatcher, OpenError};

/// How long the shell waits for the engine's handshake: it opens the
/// workspace and takes `engine.lock` first.
pub const START_WAIT: Duration = Duration::from_secs(60);

/// How long after `stop` the shell kills an engine that hasn't exited. The
/// engine itself gives running steps 10 seconds.
pub const STOP_KILL_AFTER: Duration = Duration::from_secs(15);

/// How long dropping a running engine waits after closing its input.
const DROP_GRACE: Duration = Duration::from_secs(5);

const EXIT_POLL: Duration = Duration::from_millis(25);

/// The engine's process as the shell controls it: a [`Child`], or a test's
/// stand-in.
pub trait EngineChild: Send + 'static {
    /// Whether it has exited.
    fn has_exited(&mut self) -> bool;
    /// Kills it, if it still runs, and waits for it.
    fn kill(&mut self);
}

impl EngineChild for Child {
    fn has_exited(&mut self) -> bool {
        !matches!(self.try_wait(), Ok(None))
    }

    fn kill(&mut self) {
        // It may have exited already; either way it is waited for, so it
        // leaves no zombie behind.
        let _already_exited = Child::kill(self);
        let _exit_status = self.wait();
    }
}

/// Why an engine didn't start.
#[derive(Debug)]
pub enum StartError {
    /// The program couldn't start.
    Spawn(String),
    /// It started, but its link didn't open; it was killed.
    Open(OpenError),
}

impl fmt::Display for StartError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StartError::Spawn(error) => write!(formatter, "The engine couldn't start: {error}."),
            StartError::Open(OpenError::Timeout) => {
                write!(formatter, "The engine didn't answer in time.")
            }
            StartError::Open(OpenError::Closed) => {
                write!(formatter, "The engine exited before it answered.")
            }
            StartError::Open(OpenError::Fault(fault)) => write!(formatter, "{fault}"),
        }
    }
}

impl std::error::Error for StartError {}

/// How a stop ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stopped {
    /// The engine exited by itself.
    Exited,
    /// It was killed.
    Killed,
}

/// One running engine process and the shell's link to it. Dropping it
/// closes the engine's input and kills it if it hasn't exited a few seconds
/// later.
pub struct EngineProcess {
    child: Arc<Mutex<Box<dyn EngineChild>>>,
    link: EngineLink,
}

impl EngineProcess {
    /// Starts `command` (from `engine_command`) with its standard streams
    /// piped, its errors into the shell's log, and opens the link.
    ///
    /// # Errors
    ///
    /// A [`StartError`]; an engine that started is killed first.
    pub fn start(
        mut command: Command,
        broker: SecretBroker,
        watcher: Arc<dyn LinkWatcher>,
    ) -> Result<Self, StartError> {
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command
            .spawn()
            .map_err(|error| StartError::Spawn(error.to_string()))?;
        log_stderr(&mut child, "engine");
        let (Some(input), Some(output)) = (child.stdin.take(), child.stdout.take()) else {
            EngineChild::kill(&mut child);
            return Err(StartError::Spawn("its pipes weren't open".to_owned()));
        };
        Self::attach(Box::new(child), output, input, broker, START_WAIT, watcher)
    }

    /// Opens the link to an engine that runs as `child` and speaks on
    /// `output` and `input`, waiting up to `wait` for its handshake. A fault
    /// on the link kills `child`.
    ///
    /// # Errors
    ///
    /// [`StartError::Open`]; `child` is killed first.
    pub fn attach(
        child: Box<dyn EngineChild>,
        output: impl Read + Send + 'static,
        input: impl Write + Send + 'static,
        broker: SecretBroker,
        wait: Duration,
        watcher: Arc<dyn LinkWatcher>,
    ) -> Result<Self, StartError> {
        let child = Arc::new(Mutex::new(child));
        let killer = Arc::new(KillOnFault {
            child: Arc::clone(&child),
            watcher,
        });
        match EngineLink::open(output, input, broker, wait, killer) {
            Ok(link) => Ok(Self { child, link }),
            Err(error) => {
                lock(&child).kill();
                Err(StartError::Open(error))
            }
        }
    }

    /// The link: handshake, health, and frames to the engine.
    pub fn link(&self) -> &EngineLink {
        &self.link
    }

    /// Whether the engine has exited.
    pub fn has_exited(&self) -> bool {
        lock(&self.child).has_exited()
    }

    /// Quit: sends `stop`, waits up to `kill_after` for the engine to exit,
    /// then closes its input and kills it.
    pub fn stop(self, kill_after: Duration) -> Stopped {
        if self.has_exited() {
            return Stopped::Exited;
        }
        // A closed input means the engine is stopping already; the wait
        // below covers it either way.
        let _input_closed = self.link.send_stop();
        self.end_within(kill_after)
    }

    fn end_within(&self, grace: Duration) -> Stopped {
        let deadline = Instant::now() + grace;
        while Instant::now() < deadline {
            if self.has_exited() {
                return Stopped::Exited;
            }
            std::thread::sleep(EXIT_POLL);
        }
        // Killed before its input closes: a write to an engine that
        // stopped reading can hold the input's lock until it is gone.
        lock(&self.child).kill();
        self.link.close_input();
        Stopped::Killed
    }
}

impl Drop for EngineProcess {
    fn drop(&mut self) {
        if self.has_exited() {
            return;
        }
        self.link.close_input();
        self.end_within(DROP_GRACE);
    }
}

/// Kills the engine when its link faults, then tells the shell's watcher.
struct KillOnFault {
    child: Arc<Mutex<Box<dyn EngineChild>>>,
    watcher: Arc<dyn LinkWatcher>,
}

impl LinkWatcher for KillOnFault {
    fn health_changed(&self) {
        self.watcher.health_changed();
    }

    fn ended(&self, end: LinkEnd) {
        if matches!(end, LinkEnd::Fault(_)) {
            lock(&self.child).kill();
        }
        self.watcher.ended(end);
    }
}

/// The child stays whole if a holder panicked.
fn lock<T: ?Sized>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}
