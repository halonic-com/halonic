//! Starts Halonic's sandbox helper (`halonic-sandbox-elevate.exe`) with
//! Windows' administrator prompt, for Studio's Settings › Agent sandbox and
//! the Inbox setup card (HAL-14841). The shell asks Windows itself, with
//! its own window as the prompt's owner, as the installer does since
//! HAL-14812: asked for by a hidden PowerShell under the agent host, the
//! prompt didn't show on a tester's PC, and the setup waited for ever.
//!
//! Before Windows is asked, the helper is opened so that nobody can change,
//! rename or delete it until it has started, and a signed release checks
//! through that opening that it is signed by the publisher built in
//! ([`SIGNER`]). Studio installs per user, so any program of the user's can
//! put another program in the helper's place; the prompt would still name
//! that program's publisher, but the shell refuses it before any prompt
//! (HAL-14958).
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

pub use halonic_publisher::SIGNER;

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
    /// The helper's file, opened so that nobody can change, rename or delete
    /// it until this is dropped.
    type Opened;
    /// A started helper. Dropping it lets go of it without stopping it.
    type Process: Send;
    /// Opens `helper` that way, with the publisher Windows trusts its
    /// signature for, read through that opening: `None` when it isn't
    /// signed or Windows doesn't trust the signature.
    fn open(&self, helper: &Path) -> Result<(Self::Opened, Option<String>), String>;
    /// Starts the opened helper with `verb` and the administrator prompt,
    /// owned by the window `owner` (0 for none).
    fn start(
        &self,
        helper: &Self::Opened,
        verb: Verb,
        owner: isize,
    ) -> Result<Self::Process, StartError>;
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
    publisher: Option<&'static str>,
    slot: Mutex<Slot<L::Process>>,
}

impl<L: Launch> Starts<L> {
    /// `publisher` is [`SIGNER`] outside tests: the helper must be signed by
    /// it, and with none (dev and CI builds, an unsigned release) there is
    /// nothing to check it against.
    pub fn new(launch: L, publisher: Option<&'static str>) -> Self {
        Starts {
            launch,
            publisher,
            slot: Mutex::new(Slot::Free),
        }
    }

    /// Starts `helper` with `verb` and waits at most `limit` for it.
    /// Answers [`Outcome::StillRunning`] without asking Windows while
    /// another start runs, or while the helper a start left still runs, and
    /// [`Outcome::Failed`] without asking Windows for a helper that isn't
    /// signed by the publisher.
    pub fn run(&self, helper: &Path, verb: Verb, owner: isize, limit: Duration) -> Outcome {
        if let Some(busy) = self.take_slot() {
            return busy;
        }
        let opened = match self.open(helper) {
            Ok(opened) => opened,
            Err(reason) => {
                self.set(Slot::Free);
                return Outcome::Failed(reason);
            }
        };
        let started = self.launch.start(&opened, verb, owner);
        // Once Windows has started it, swapping its file changes nothing.
        drop(opened);
        let process = match started {
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

    /// Opens `helper`, and refuses it unless it is signed by the publisher.
    fn open(&self, helper: &Path) -> Result<L::Opened, String> {
        let (opened, signer) = self.launch.open(helper)?;
        match self.publisher {
            Some(publisher) if signer.as_deref() != Some(publisher) => Err(format!(
                "the sandbox helper beside the app isn't signed by {publisher}, so Windows wasn't asked to start it"
            )),
            _ => Ok(opened),
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
