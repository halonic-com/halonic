//! Starts Halonic's sandbox helper (`halonic-sandbox-elevate.exe`) with
//! Windows' administrator prompt, for Studio's Settings › Agent sandbox and
//! the Inbox setup card (HAL-14841). The shell asks Windows itself, with
//! its own window as the prompt's owner, as the installer does since
//! HAL-14812: asked for by a hidden PowerShell under the agent host, the
//! prompt didn't show on a tester's PC, and the setup waited for ever.
//!
//! One start runs at a time, and each waits at most a time limit. A helper
//! still running at the limit is left to finish, never stopped: it runs as
//! an administrator, and stopping it halfway would leave the machine half
//! set up. Until it ends, a new start says so instead of asking Windows
//! again.
//!
//! The rules are written against [`Launch`], so they are tested anywhere;
//! the Windows calls are in the `windows` module.

use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::Windows;

/// What the helper is asked to do; it takes nothing else.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verb {
    Setup,
    Remove,
}

impl Verb {
    /// The helper's one argument for this verb.
    pub fn argument(self) -> &'static str {
        match self {
            Verb::Setup => "setup",
            Verb::Remove => "remove",
        }
    }
}

/// How a start ended.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Outcome {
    /// The helper ran and exited with this code.
    Exited(u32),
    /// The person turned the prompt down, or closed it: Windows' `ERROR_CANCELLED`.
    Cancelled,
    /// The helper still ran at the time limit. It is left to finish.
    TimedOut,
    /// A helper started earlier still runs, so Windows wasn't asked again.
    StillRunning,
    /// Windows didn't start the helper, or the wait for it failed, and why.
    Failed(String),
}

/// Why Windows didn't start the helper.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StartError {
    /// The person turned the prompt down, or closed it.
    Cancelled,
    /// Any other reason, as a sentence.
    Other(String),
}

/// Whether a started helper has ended.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Wait {
    Exited(u32),
    Running,
}

/// What [`Starts`] asks of the operating system. [`Windows`] is the real one.
pub trait Launch {
    /// A started helper. Dropping it lets go of it without stopping it.
    type Process: Send;
    /// Starts `helper` with `verb` and the administrator prompt, owned by
    /// the window `owner` (0 for none).
    fn start(&self, helper: &Path, verb: Verb, owner: isize) -> Result<Self::Process, StartError>;
    /// Waits at most `limit` for `process` to end.
    fn wait(&self, process: &Self::Process, limit: Duration) -> Result<Wait, String>;
}

/// The start that runs, if any.
enum Slot<P> {
    Free,
    /// A start is asking Windows or waiting for the helper.
    Busy,
    /// A helper that still ran at its time limit.
    Left(P),
}

/// The one start of the helper that may run at a time, and the helper left
/// running after its time limit.
pub struct Starts<L: Launch> {
    launch: L,
    slot: Mutex<Slot<L::Process>>,
}

impl<L: Launch> Starts<L> {
    pub fn new(launch: L) -> Self {
        Starts {
            launch,
            slot: Mutex::new(Slot::Free),
        }
    }

    /// Starts `helper` with `verb` and waits at most `limit` for it.
    /// Answers [`Outcome::StillRunning`] without asking Windows while
    /// another start runs, or while the helper a start left still runs.
    pub fn run(&self, helper: &Path, verb: Verb, owner: isize, limit: Duration) -> Outcome {
        if let Some(busy) = self.take_slot() {
            return busy;
        }
        let process = match self.launch.start(helper, verb, owner) {
            Ok(process) => process,
            Err(error) => {
                self.set(Slot::Free);
                return match error {
                    StartError::Cancelled => Outcome::Cancelled,
                    StartError::Other(reason) => Outcome::Failed(reason),
                };
            }
        };
        match self.launch.wait(&process, limit) {
            Ok(Wait::Exited(code)) => {
                self.set(Slot::Free);
                Outcome::Exited(code)
            }
            Ok(Wait::Running) => {
                self.set(Slot::Left(process));
                Outcome::TimedOut
            }
            Err(reason) => {
                // It may still run; the next start looks again.
                self.set(Slot::Left(process));
                Outcome::Failed(reason)
            }
        }
    }

    /// Marks the slot busy and answers `None`, or answers why it can't.
    fn take_slot(&self) -> Option<Outcome> {
        let mut slot = self.slot.lock().unwrap_or_else(|e| e.into_inner());
        match &*slot {
            Slot::Busy => return Some(Outcome::StillRunning),
            Slot::Left(process) => {
                // A failed look counts as running: never two prompts at once.
                if !matches!(
                    self.launch.wait(process, Duration::ZERO),
                    Ok(Wait::Exited(_))
                ) {
                    return Some(Outcome::StillRunning);
                }
            }
            Slot::Free => {}
        }
        *slot = Slot::Busy;
        None
    }

    fn set(&self, next: Slot<L::Process>) {
        *self.slot.lock().unwrap_or_else(|e| e.into_inner()) = next;
    }
}

#[cfg(test)]
mod tests;
