//! The WSL setup run from Windows (HAL-16765): the host beside the shell,
//! started once with `--wsl-setup`, imports Halonic's distro and prints how
//! it ended as one JSON line (HAL-16770). It has to run from the Windows
//! side: with no distro, the host in it can't start, so it can't be asked.
//!
//! Every argument is the shell's own: the profile folder, the image beside
//! the app, and the app itself as the command `RunOnce` starts after a
//! restart. One run at a time; a run still going at its time limit is left
//! to finish, because stopping it halfway through `wsl --import` could leave
//! a distro registered with half a disk.

use std::io::Read;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, mpsc};
use std::time::Duration;

use serde::Deserialize;

use crate::console_window::new_command;
use crate::stderr_log::log_stderr;

/// The image of Halonic's distro, which the shell looks for beside the app
/// (`infra/wsl-image`).
pub const WSL_IMAGE: &str = "halonic-wsl.tar.gz";

/// The most of the setup's output the shell reads. Its JSON line is far
/// shorter; this only keeps a broken host from filling the shell's memory.
const OUTPUT_LIMIT: u64 = 64 * 1024;

/// The command that runs the setup once with `executable`, the host beside
/// the shell, for `profile_folder`, from `image`, with `resume_command` for
/// `RunOnce`. Its standard input is closed: the setup asks nothing.
pub fn wsl_setup_command(
    executable: &Path,
    profile_folder: &Path,
    image: &Path,
    resume_command: &str,
) -> Command {
    let mut command = new_command(executable);
    command
        .arg("--wsl-setup")
        .arg("--profile-folder")
        .arg(profile_folder)
        .arg("--wsl-image")
        .arg(image)
        .arg("--resume-command")
        .arg(resume_command)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command
}

/// The command line `RunOnce` starts after Windows restarts: `program`
/// alone, quoted, since the app's folder may have spaces in it.
#[must_use]
pub fn resume_command(program: &Path) -> String {
    format!("\"{}\"", program.display())
}

/// How the setup said it ended: `WslSetupResult` of
/// `packages/adapters/sandbox-srt`. `reason` is a code from the sandbox
/// port's list, `code` the setup's own; `detail` is for the log and
/// support only. Fields the shell doesn't use are ignored.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "outcome", rename_all = "kebab-case")]
pub enum WslSetupEnd {
    Done,
    RestartNeeded,
    Cancelled,
    Blocked {
        reason: String,
        #[serde(default)]
        detail: String,
    },
    Failed {
        reason: String,
        code: String,
        #[serde(default)]
        detail: String,
    },
}

/// The setup's answer in `output`: its last line that isn't empty, read as
/// JSON. `None` when there is no such line or it isn't an answer.
#[must_use]
pub fn read_wsl_setup_end(output: &[u8]) -> Option<WslSetupEnd> {
    let text = String::from_utf8_lossy(output);
    let line = text
        .lines()
        .map(str::trim)
        .rev()
        .find(|line| !line.is_empty())?;
    serde_json::from_str(line).ok()
}

/// How a run went, for the shell.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WslSetupRun {
    /// It ended and said how.
    Ended(WslSetupEnd),
    /// It ended without an answer the shell reads, with its exit code when
    /// it had one.
    Unreadable(Option<i32>),
    /// It still ran at the time limit, and is left to finish.
    TimedOut,
    /// A run started earlier still runs, so no other started.
    StillRunning,
    /// It didn't start, and why.
    NotStarted(String),
}

/// What a finished run left: its exit code and what it printed.
type Finished = (Option<i32>, Vec<u8>);

/// The run that goes on, if any.
enum Slot {
    Free,
    /// A run is being started or waited for.
    Busy,
    /// A run that still went on at its time limit; it says here when it ends.
    Left(mpsc::Receiver<Finished>),
}

/// The one run of the setup that may go on at a time.
pub struct WslSetupRuns {
    slot: Mutex<Slot>,
}

impl Default for WslSetupRuns {
    fn default() -> Self {
        WslSetupRuns {
            slot: Mutex::new(Slot::Free),
        }
    }
}

impl WslSetupRuns {
    /// Starts `command` and waits at most `limit` for its answer. Answers
    /// [`WslSetupRun::StillRunning`], starting nothing, while another run
    /// goes on, including one left at its time limit.
    pub fn run(&self, mut command: Command, limit: Duration) -> WslSetupRun {
        if self.busy() {
            return WslSetupRun::StillRunning;
        }
        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                self.set(Slot::Free);
                return WslSetupRun::NotStarted(error.to_string());
            }
        };
        log_stderr(&mut child, "wsl-setup");
        let finished = finish_in_background(child);
        match finished.recv_timeout(limit) {
            Ok((code, output)) => {
                self.set(Slot::Free);
                read_wsl_setup_end(&output)
                    .map_or(WslSetupRun::Unreadable(code), WslSetupRun::Ended)
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                self.set(Slot::Left(finished));
                WslSetupRun::TimedOut
            }
            // The thread that waits for it ended without a word: nothing
            // is known about the run, so it isn't read as an answer.
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                self.set(Slot::Free);
                WslSetupRun::Unreadable(None)
            }
        }
    }

    /// Whether a run goes on; when none does, marks the slot busy for this one.
    fn busy(&self) -> bool {
        let mut slot = self.slot.lock().unwrap_or_else(|e| e.into_inner());
        match &*slot {
            Slot::Busy => return true,
            Slot::Left(finished) => {
                if matches!(finished.try_recv(), Err(mpsc::TryRecvError::Empty)) {
                    return true;
                }
            }
            Slot::Free => {}
        }
        *slot = Slot::Busy;
        false
    }

    fn set(&self, next: Slot) {
        *self.slot.lock().unwrap_or_else(|e| e.into_inner()) = next;
    }
}

/// Reads what `child` prints, up to [`OUTPUT_LIMIT`], and waits for it on
/// a thread of its own; the receiver gets its exit code and output once it
/// ends. Output past the limit is read and dropped, so a full pipe never
/// holds the child up.
fn finish_in_background(mut child: Child) -> mpsc::Receiver<Finished> {
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut output = Vec::new();
        if let Some(mut stdout) = child.stdout.take() {
            // A read that fails leaves the output short, and so unread as
            // an answer: the run then counts as one that said nothing.
            if let Err(error) = stdout.by_ref().take(OUTPUT_LIMIT).read_to_end(&mut output) {
                halonic_shell_log::record("wsl-setup", format!("its output broke off: {error}"));
            }
            // Only so the child never waits on a full pipe: what is past the
            // limit was never going to be read, so a failure here loses nothing.
            let _ = std::io::copy(&mut stdout, &mut std::io::sink());
        }
        let code = child.wait().ok().and_then(|status| status.code());
        // The shell may have stopped listening; then nobody needs the answer.
        let _ = sender.send((code, output));
    });
    receiver
}

#[cfg(test)]
#[path = "wsl_setup_tests.rs"]
mod tests;
