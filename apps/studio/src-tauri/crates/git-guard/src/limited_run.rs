use std::ffi::OsStr;
use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, Instant};

use crate::error::GitError;

/// Windows' `CREATE_NO_WINDOW` process flag. The release shell is a GUI
/// program, so git, or `taskkill`, would otherwise open a console window of
/// its own on every call (HAL-13197).
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The crate's one way to make a command: `program` started, on Windows,
/// without a console window of its own.
#[expect(
    clippy::disallowed_methods,
    reason = "the crate's one Command::new, which hides the console window"
)]
pub(crate) fn new_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// How long git may run and how much it may write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    /// For calls that stay on this computer.
    pub local_timeout: Duration,
    /// For `pull` and `push`, which wait on the network.
    pub network_timeout: Duration,
    /// The most bytes git may write to stdout, and again to stderr.
    pub max_output_bytes: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            local_timeout: Duration::from_secs(30),
            network_timeout: Duration::from_secs(5 * 60),
            max_output_bytes: 32 * 1024 * 1024,
        }
    }
}

/// What git said: its exit code and both output streams in full.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitOutput {
    /// The exit code, or `None` if a signal ended git.
    pub code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

/// How often the runner looks at the clock and the output while git runs.
const POLL_INTERVAL: Duration = Duration::from_millis(10);

/// How long the output readers may still take after git has exited, even
/// at the deadline, so a call that ends just in time isn't failed.
const READER_GRACE: Duration = Duration::from_secs(1);

/// What a reader thread sends back: the bytes it read, or why it stopped.
type ReaderResult = std::io::Result<Vec<u8>>;

/// Runs a prepared command to the end, by a deadline and within an output
/// limit (requirement `git-limits`).
///
/// git runs in a process group of its own, so the programs it starts, such
/// as `ssh` or `git-remote-https`, are stopped with it. Over either limit
/// the whole group is stopped and the call fails: a `status` or a `diff`
/// cut off at the limit would look complete, which is worse than an error.
/// A program that outlives git and keeps the output pipes open, such as an
/// ssh connection kept for reuse, can't hold the call past the deadline
/// either: the readers get the same deadline, and past it the call fails.
/// That program is not stopped: once git has exited and been waited for,
/// its process id is free again, so signalling it could hit another
/// program.
pub(crate) fn run_limited(
    command: &mut Command,
    deadline: Instant,
    max_output_bytes: usize,
) -> Result<GitOutput, GitError> {
    run_watched(command, deadline, max_output_bytes, &mut || None)
}

/// [`run_limited`] with a `watch` that is asked on every turn of the wait
/// loop. When it answers an error, git is stopped with every program it
/// started and the call fails with that error: the export uses it to stop
/// on the caller's say and when its folder grows past a limit.
pub(crate) fn run_watched(
    command: &mut Command,
    deadline: Instant,
    max_output_bytes: usize,
    watch: &mut dyn FnMut() -> Option<GitError>,
) -> Result<GitOutput, GitError> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    own_process_group(command);
    let mut child = command.spawn().map_err(io_error)?;
    let too_large = Arc::new(AtomicBool::new(false));
    let stdout = read_in_background(child.stdout.take(), max_output_bytes, &too_large);
    let stderr = read_in_background(child.stderr.take(), max_output_bytes, &too_large);
    let code = loop {
        if too_large.load(Ordering::SeqCst) {
            stop(&mut child);
            return Err(GitError::OutputTooLarge);
        }
        if let Some(status) = child.try_wait().map_err(io_error)? {
            break status.code();
        }
        if let Some(error) = watch() {
            stop(&mut child);
            return Err(error);
        }
        if Instant::now() >= deadline {
            stop(&mut child);
            return Err(GitError::TimedOut);
        }
        thread::sleep(POLL_INTERVAL);
    };
    let reader_deadline = deadline.max(Instant::now() + READER_GRACE);
    let stdout = collect(&stdout, reader_deadline)?;
    let stderr = collect(&stderr, reader_deadline)?;
    if stdout.len() > max_output_bytes || stderr.len() > max_output_bytes {
        return Err(GitError::OutputTooLarge);
    }
    Ok(GitOutput {
        code,
        stdout,
        stderr,
    })
}

/// Reads a pipe until it closes or passes the limit, and sends what it read.
/// Past the limit it raises the shared flag and stops reading; the loop then
/// stops git.
fn read_in_background(
    pipe: Option<impl Read + Send + 'static>,
    max_bytes: usize,
    too_large: &Arc<AtomicBool>,
) -> Receiver<ReaderResult> {
    let too_large = Arc::clone(too_large);
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut collected = Vec::new();
        let result = match pipe {
            None => Ok(collected),
            Some(pipe) => {
                // One byte over the limit is enough to know it was passed.
                let limit = u64::try_from(max_bytes)
                    .unwrap_or(u64::MAX)
                    .saturating_add(1);
                pipe.take(limit)
                    .read_to_end(&mut collected)
                    .map(|_| collected)
            }
        };
        if result.as_ref().is_ok_and(|bytes| bytes.len() > max_bytes) {
            too_large.store(true, Ordering::SeqCst);
        }
        // The call may have given up on this reader already; then nobody
        // is listening, and that is fine.
        let _ = sender.send(result);
    });
    receiver
}

/// Waits for a reader until the deadline. A reader still waiting then is
/// left to finish on its own: its pipe closes once the last program
/// holding it ends.
fn collect(reader: &Receiver<ReaderResult>, deadline: Instant) -> Result<Vec<u8>, GitError> {
    let wait = deadline.saturating_duration_since(Instant::now());
    match reader.recv_timeout(wait) {
        Ok(result) => result.map_err(io_error),
        Err(mpsc::RecvTimeoutError::Timeout) => Err(GitError::TimedOut),
        Err(mpsc::RecvTimeoutError::Disconnected) => Err(GitError::Io {
            message: "the output reader stopped".to_owned(),
        }),
    }
}

/// Stops git with everything it started, and waits for git, so no process
/// is left behind. Errors are ignored on purpose: git may already have
/// exited, and the call fails either way.
fn stop(child: &mut Child) {
    stop_group(child);
    let _ = child.kill();
    let _ = child.wait();
}

/// On Unix, git leads a process group of its own, with the same id as its
/// process. `kill` with a negative id signals the whole group. git has not
/// been waited for yet whenever the call stops it, so the id is still git's.
#[cfg(unix)]
fn own_process_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

#[cfg(unix)]
fn stop_group(child: &Child) {
    // The crate has no dependencies and no unsafe code, so the group is
    // signalled through the shell's own `kill`, which every Unix has, even
    // where no `kill` program is installed. The id is a number the shell
    // reads as nothing else.
    let _ = new_command("/bin/sh")
        .args([
            "-c",
            "kill -s KILL -- \"-$1\"",
            "sh",
            &child.id().to_string(),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

/// On Windows, `taskkill /T` stops git and every process it started. It
/// finds them through git, which still runs whenever the call stops it.
#[cfg(windows)]
fn own_process_group(_command: &mut Command) {}

#[cfg(windows)]
fn stop_group(child: &Child) {
    let Some(system_root) = std::env::var_os("SystemRoot") else {
        return;
    };
    let taskkill = std::path::Path::new(&system_root)
        .join("System32")
        .join("taskkill.exe");
    let _ = new_command(taskkill)
        .args(["/F", "/T", "/PID", &child.id().to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

fn io_error(error: std::io::Error) -> GitError {
    GitError::Io {
        message: error.to_string(),
    }
}

#[cfg(test)]
#[path = "limited_run_tests.rs"]
mod tests;
