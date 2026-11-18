//! The agent host's and `wsl.exe`'s stderr, written into the shell's log.

use std::io::{BufRead, BufReader, Read};
use std::process::Child;

/// The longest stderr line [`log_stderr`] reads at once; the rest of a
/// longer one comes as the next line.
const STDERR_LINE_LIMIT: u64 = 64 * 1024;

/// Writes what `child` prints on stderr into the shell's log, a line at a
/// time, as `source`. A release build on Windows has no console, so stderr
/// passed on would go nowhere; and a pipe nobody reads would stall the
/// child once it is full, so a thread reads it until the child closes it.
pub(crate) fn log_stderr(child: &mut Child, source: &'static str) {
    let Some(stderr) = child.stderr.take() else {
        return;
    };
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut line = Vec::new();
        loop {
            line.clear();
            match reader
                .by_ref()
                .take(STDERR_LINE_LIMIT)
                .read_until(b'\n', &mut line)
            {
                Ok(0) | Err(_) => return,
                Ok(_) => {
                    let text = String::from_utf8_lossy(&line);
                    halonic_shell_log::record(source, text.trim_end());
                }
            }
        }
    });
}
