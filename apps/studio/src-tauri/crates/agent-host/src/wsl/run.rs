//! How a step in the distro is run: `wsl.exe` with its input, a time limit,
//! and its exit code read as a [`WslError`].

use std::io::{Read, Write};
use std::process::{Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

use super::WslError;
use crate::console_window::without_console_window;
use crate::stderr_log::log_stderr;

/// What a step reads on its standard input.
pub(crate) enum Input {
    /// Given to the step as it is: nothing, or an open file.
    Given(Stdio),
    /// A few bytes, then the end of the input.
    Bytes(Vec<u8>),
}

pub(super) fn run(command: Command, input: Input) -> Result<String, WslError> {
    run_within(command, input, Duration::MAX)
}

pub(super) fn run_within(
    command: Command,
    input: Input,
    limit: Duration,
) -> Result<String, WslError> {
    run_within_bytes(command, input, limit)
        .map(|printed| String::from_utf8_lossy(&printed).into_owned())
}

/// Runs `command` with `input` and answers the bytes it printed, stopping it
/// after `limit`. A `wsl.exe` of its own prints UTF-16, so the caller decodes.
pub(crate) fn run_within_bytes(
    mut command: Command,
    input: Input,
    limit: Duration,
) -> Result<Vec<u8>, WslError> {
    let (stdin, bytes) = match input {
        Input::Given(stdin) => (stdin, None),
        Input::Bytes(bytes) => (Stdio::piped(), Some(bytes)),
    };
    command
        .stdin(stdin)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    without_console_window(&mut command);
    let mut child = command
        .spawn()
        .map_err(|error| WslError::Start(format!("wsl.exe could not start: {error}.")))?;
    log_stderr(&mut child, "wsl");
    // Written on another thread, so a step that doesn't read yet can't stall the wait.
    let writer = bytes.map(|bytes| {
        let mut stdin = child.stdin.take().expect("stdin is piped");
        std::thread::spawn(move || stdin.write_all(&bytes))
    });
    let mut stdout = child.stdout.take().expect("stdout is piped");
    // Read on another thread, so a step that fills the pipe can't stall the wait.
    let reader = std::thread::spawn(move || {
        let mut printed = Vec::new();
        let _ = stdout.read_to_end(&mut printed);
        printed
    });
    let deadline = Instant::now().checked_add(limit);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if deadline.is_some_and(|deadline| Instant::now() >= deadline) => {
                let _ = child.kill();
                // The reader is left to end on its own: a child of the step may still hold the pipe.
                let _ = child.wait();
                return Err(WslError::TimedOut);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(error) => {
                let _ = child.kill();
                return Err(WslError::Start(format!(
                    "wsl.exe could not be awaited: {error}."
                )));
            }
        }
    };
    let printed = reader.join().unwrap_or_default();
    let printed = ending(status, printed)?;
    // A step that ended well without all of its input must not count as done.
    match writer.map(std::thread::JoinHandle::join) {
        Some(Ok(Err(error))) => Err(WslError::Start(format!(
            "wsl.exe didn't take all of its input: {error}."
        ))),
        Some(Err(_)) => Err(WslError::Start(
            "wsl.exe's input couldn't be sent.".to_owned(),
        )),
        _ => Ok(printed),
    }
}

fn ending(status: ExitStatus, stdout: Vec<u8>) -> Result<Vec<u8>, WslError> {
    match status.code() {
        Some(0) => Ok(stdout),
        Some(3) => Err(WslError::Busy),
        Some(4) => Err(WslError::ChecksumDiffers),
        Some(5) => Err(WslError::ArchiveRefused),
        Some(6) => Err(WslError::NothingToRollBack),
        Some(7) => Err(WslError::MountsLeft),
        code => Err(WslError::Failed(code)),
    }
}
