//! Windows refusals that mean "another writer has the lock file right now".
//! While a writer deletes the lock, the file stays delete-pending until the
//! last handle to it is closed, and creating, reading or renaming it then
//! fails with `ERROR_ACCESS_DENIED` instead of `AlreadyExists` or
//! `NotFound`. A program that briefly has the file open without sharing it,
//! such as a virus scanner, gives `ERROR_SHARING_VIOLATION`. Both pass in
//! milliseconds, so a step that fails with one is tried again.
//!
//! The wait is bounded: a folder this user may not write to also gives
//! `ERROR_ACCESS_DENIED`, and that error must reach the caller instead of
//! making a save wait forever. On other systems these codes mean something
//! else and are never retried.

use std::io;
use std::thread;
use std::time::{Duration, Instant};

/// `ERROR_ACCESS_DENIED`: the file is delete-pending, or really refused.
const ACCESS_DENIED: i32 = 5;

/// `ERROR_SHARING_VIOLATION`: another program has the file open.
const SHARING_VIOLATION: i32 = 32;

/// How long a step may keep failing with a busy error before the error is
/// given to the caller. A delete-pending file is gone in milliseconds; this
/// leaves room for a slow scanner and a loaded computer.
const BUSY_LIMIT: Duration = Duration::from_secs(2);

/// How long to wait before trying a busy step again.
const BUSY_DELAY: Duration = Duration::from_millis(15);

/// When to try a failed step again.
pub(crate) struct BusyRetry {
    /// Whether the errors come from Windows, where the busy codes mean busy.
    pub(crate) windows: bool,
    /// How long a step may keep failing before its error is given back.
    pub(crate) limit: Duration,
}

/// The retry rules for this computer.
pub(crate) const HERE: BusyRetry = BusyRetry {
    windows: cfg!(windows),
    limit: BUSY_LIMIT,
};

impl BusyRetry {
    /// Runs `step` until it succeeds or fails with an error that isn't busy,
    /// trying again while it is busy for up to `limit`. Gives the last error
    /// when the step stays busy that long.
    pub(crate) fn run<T>(&self, mut step: impl FnMut() -> io::Result<T>) -> io::Result<T> {
        let started = Instant::now();
        loop {
            match step() {
                Err(error) if self.is_busy(&error) && started.elapsed() < self.limit => {
                    thread::sleep(BUSY_DELAY);
                }
                done => return done,
            }
        }
    }

    fn is_busy(&self, error: &io::Error) -> bool {
        self.windows
            && matches!(
                error.raw_os_error(),
                Some(ACCESS_DENIED | SHARING_VIOLATION)
            )
    }
}

#[cfg(test)]
#[path = "busy_tests.rs"]
mod tests;
