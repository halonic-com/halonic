//! How far Studio's start has got, for the Welcome page (HAL-13408; design
//! HAL-7986, first-run-progress 3.2). Studio starts in phases: the page
//! loads, the page's engine is ready (`engine_ready`), on Windows Halonic's
//! WSL distro is there, and the agent host has started. The page polls
//! `start_status` and shows "still starting" after 30 s; after 60 s, or as
//! soon as the host fails to start, it shows why. Both times count from the
//! page's load, which the shell notes (`page_loaded`).
//!
//! The report holds fixed values only: a state, a phase, a cause and an exit
//! code. It never holds the host's error output or a message, which can hold
//! paths and names.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use halonic_agent_host::{AgentHostError, StartCause};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use super::AgentHostState;
use super::start::running_host;

/// When the page says "still starting". Measured in HAL-13415.
const STILL_STARTING_AFTER: Duration = Duration::from_secs(30);

/// When the page gives up and says the engine didn't start. The same as the
/// shell's own wait for the host (`START_WAIT`), because the first start
/// unpacks files. Measured in HAL-13415.
const GIVE_UP_AFTER: Duration = Duration::from_secs(60);

/// A phase of Studio's start, in the order they are reached.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StartPhase {
    PageLoaded,
    EngineReady,
    /// Windows only: Halonic's WSL distro is there to start the host in.
    WslReady,
    HostStarted,
}

/// Where the start is, as the Welcome page shows it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StartState {
    Starting,
    /// It has taken 30 s or more.
    StillStarting,
    Ready,
    Failed,
}

/// Why the start failed. Each picks one sentence on the Welcome page.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FailureCause {
    /// Nothing answered within 60 s.
    TimedOut,
    /// The host's program isn't there.
    Missing,
    /// The host answered with something that isn't a handshake: a broken install.
    Broken,
    /// The system wouldn't run the host: a permission, or an antivirus program.
    Blocked,
    /// The host stopped while it was starting.
    Stopped,
    /// Windows: `wsl.exe` can't be found.
    WslMissing,
    /// Windows: Halonic's WSL distro isn't installed.
    DistroMissing,
    /// Windows: `wsl.exe` couldn't list the distros.
    WslFailed,
    /// Anything else, such as a profile that can't be read.
    Other,
}

/// A failed start: its cause, and the exit code when there is one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StartFailure {
    pub cause: FailureCause,
    pub exit_code: Option<i32>,
}

impl StartFailure {
    pub const fn of(cause: FailureCause) -> Self {
        Self {
            cause,
            exit_code: None,
        }
    }
}

impl From<&AgentHostError> for StartFailure {
    fn from(error: &AgentHostError) -> Self {
        match error {
            AgentHostError::Start(StartCause::Missing, _) => Self::of(FailureCause::Missing),
            AgentHostError::Start(StartCause::Blocked, _) => Self::of(FailureCause::Blocked),
            AgentHostError::Start(StartCause::Other, _) => Self::of(FailureCause::Other),
            AgentHostError::Exited(exit_code) => Self {
                cause: FailureCause::Stopped,
                exit_code: *exit_code,
            },
            AgentHostError::TimedOut(_) => Self::of(FailureCause::TimedOut),
            AgentHostError::Handshake(_) => Self::of(FailureCause::Broken),
        }
    }
}

/// What `start_status` answers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartReport {
    pub state: StartState,
    /// The last phase reached.
    pub phase: StartPhase,
    /// Set only when the state is `failed`.
    pub cause: Option<FailureCause>,
    /// Set only when the host stopped while starting, or `wsl.exe` failed,
    /// with an exit code. `None` when a signal stopped it.
    pub exit_code: Option<i32>,
    /// Whole seconds since the page loaded.
    pub seconds: u64,
}

/// What the shell has seen of the start since the page last loaded.
#[derive(Debug, Default)]
struct Seen {
    /// When the timer started: the page's load, or a new try after a failure.
    since: Option<Instant>,
    engine_ready: bool,
    wsl_ready: bool,
    host_started: bool,
    failure: Option<StartFailure>,
}

impl Seen {
    fn report(&self, now: Instant) -> StartReport {
        let waited = self
            .since
            .map_or(Duration::ZERO, |since| now.saturating_duration_since(since));
        let (state, failure) = if self.engine_ready && self.host_started {
            (StartState::Ready, None)
        } else if let Some(failure) = self.failure {
            (StartState::Failed, Some(failure))
        } else if waited >= GIVE_UP_AFTER {
            (
                StartState::Failed,
                Some(StartFailure::of(FailureCause::TimedOut)),
            )
        } else if waited >= STILL_STARTING_AFTER {
            (StartState::StillStarting, None)
        } else {
            (StartState::Starting, None)
        };
        StartReport {
            state,
            phase: self.phase(),
            cause: failure.map(|failure| failure.cause),
            exit_code: failure.and_then(|failure| failure.exit_code),
            seconds: waited.as_secs(),
        }
    }

    fn phase(&self) -> StartPhase {
        if !self.engine_ready {
            StartPhase::PageLoaded
        } else if self.host_started {
            StartPhase::HostStarted
        } else if self.wsl_ready {
            StartPhase::WslReady
        } else {
            StartPhase::EngineReady
        }
    }
}

/// The start's phases and timer, kept with the host's state.
#[derive(Debug, Default)]
pub struct StartProgress {
    seen: Mutex<Seen>,
}

impl StartProgress {
    /// The page has loaded: everything seen before is forgotten and the
    /// timer starts again.
    pub fn page_loaded(&self, now: Instant) {
        self.update(|seen| {
            *seen = Seen {
                since: Some(now),
                ..Seen::default()
            };
        });
    }

    /// The page's engine is ready. After a failed start this is a new try,
    /// so the failure is forgotten and the timer starts again.
    pub fn engine_ready(&self, now: Instant) {
        self.update(|seen| {
            if seen.since.is_none() || seen.report(now).state == StartState::Failed {
                seen.since = Some(now);
                seen.failure = None;
            }
            seen.engine_ready = true;
        });
    }

    pub fn wsl_ready(&self) {
        self.update(|seen| seen.wsl_ready = true);
    }

    pub fn host_started(&self) {
        self.update(|seen| {
            seen.host_started = true;
            seen.failure = None;
        });
    }

    pub fn host_failed(&self, failure: StartFailure) {
        self.update(|seen| {
            seen.host_started = false;
            seen.failure = Some(failure);
        });
    }

    pub fn report(&self, now: Instant) -> StartReport {
        match self.seen.lock() {
            Ok(seen) => seen.report(now),
            Err(poisoned) => poisoned.into_inner().report(now),
        }
    }

    fn update(&self, change: impl FnOnce(&mut Seen)) {
        match self.seen.lock() {
            Ok(mut seen) => change(&mut seen),
            Err(poisoned) => change(&mut poisoned.into_inner()),
        }
    }
}

/// Notes that the page has (re)loaded, which starts the start's timer.
pub fn page_loaded<R: Runtime>(app: &AppHandle<R>) {
    app.state::<AgentHostState>()
        .progress
        .page_loaded(Instant::now());
}

/// The page's engine is ready. The shell then starts the agent host, unless
/// it runs already; how that goes shows in `start_status`.
#[tauri::command]
pub fn engine_ready<R: Runtime>(app: AppHandle<R>) {
    app.state::<AgentHostState>()
        .progress
        .engine_ready(Instant::now());
    tauri::async_runtime::spawn(async move {
        // Kept by the start itself for `start_status`; nobody waits here.
        let _ = running_host(&app).await;
    });
}

/// Where Studio's start is. Reads only; the page polls it.
#[tauri::command]
pub fn start_status<R: Runtime>(app: AppHandle<R>) -> StartReport {
    app.state::<AgentHostState>()
        .progress
        .report(Instant::now())
}

#[cfg(test)]
#[path = "agent_host_progress_tests.rs"]
mod tests;
