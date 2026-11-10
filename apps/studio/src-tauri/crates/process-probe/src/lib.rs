//! Asks the operating system two questions the standard library can't
//! answer: does a process still run, and what is this computer called. The
//! run lock needs both to tell a crashed writer's lock from a live one, and
//! must get the same answers as Node (`process.kill(pid, 0)` and
//! `os.hostname()`), so a CLI and the desktop app judge one lock alike.
//!
//! Both answers come from the same calls libuv, and so Node, makes. Nothing
//! unsafe leaves this crate: callers get a `bool` and a `String`.

#[cfg(unix)]
mod unix;
#[cfg(unix)]
use unix as os;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
use windows as os;

/// Whether a process with this id runs on this computer, as Node's
/// `process.kill(pid, 0)` judges it: a process that runs as another user, or
/// that this process may not look at, counts as running.
///
/// An id of 0, or one above `i32::MAX`, is never a running process: 0 names
/// a process group, not one process, and Node refuses any id that isn't a
/// 32-bit signed number.
pub fn process_alive(pid: u32) -> bool {
    match i32::try_from(pid) {
        Ok(pid) if pid > 0 => os::process_alive(pid),
        _ => false,
    }
}

/// This computer's name, as Node's `os.hostname()` gives it: `gethostname`
/// on Unix, `GetHostNameW` (the DNS host name) on Windows. `None` when the
/// operating system can't tell or the name isn't valid Unicode; a caller
/// then treats every lock as another computer's.
pub fn host_name() -> Option<String> {
    os::host_name()
}
