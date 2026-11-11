//! Renaming a file over another, as `renameOver` in `fs-node` does: on
//! Windows a rename fails while another program briefly holds the target
//! open, such as a virus scanner or a search indexer, so there it tries
//! again a few times.

use std::io;
use std::path::Path;
use std::thread;
use std::time::Duration;

/// How long to wait before each try again, in milliseconds, as
/// `renameRetryDelaysMs` in `fs-node`.
const RETRY_DELAYS_MS: [u64; 5] = [10, 20, 40, 80, 160];

/// Renames `from` over `to`. On Windows a rename the system refuses because
/// the target is held (what Node calls `EPERM` and `EBUSY`) is tried again
/// after 10, 20, 40, 80 and 160 ms; any other error, and every error
/// elsewhere, is returned at once: there a refusal is a real lack of
/// permission.
pub(crate) fn rename_over(from: &Path, to: &Path) -> io::Result<()> {
    let delays: &[u64] = if cfg!(windows) { &RETRY_DELAYS_MS } else { &[] };
    rename_with(
        delays,
        || std::fs::rename(from, to),
        |delay| {
            thread::sleep(Duration::from_millis(delay));
        },
    )
}

/// The retries, with the rename and the wait passed in so they can be
/// tested on any system.
fn rename_with(
    delays: &[u64],
    mut rename: impl FnMut() -> io::Result<()>,
    mut wait: impl FnMut(u64),
) -> io::Result<()> {
    for &delay in delays {
        match rename() {
            Ok(()) => return Ok(()),
            Err(error) if is_busy(&error) => wait(delay),
            Err(error) => return Err(error),
        }
    }
    rename()
}

/// Whether Windows refused because another program holds the file: the
/// codes libuv reads as `EPERM` (`ERROR_ACCESS_DENIED`) and `EBUSY`
/// (`ERROR_SHARING_VIOLATION`, `ERROR_LOCK_VIOLATION`).
fn is_busy(error: &io::Error) -> bool {
    /// `winerror.h`.
    const ERROR_ACCESS_DENIED: i32 = 5;
    const ERROR_SHARING_VIOLATION: i32 = 32;
    const ERROR_LOCK_VIOLATION: i32 = 33;
    matches!(
        error.raw_os_error(),
        Some(ERROR_ACCESS_DENIED | ERROR_SHARING_VIOLATION | ERROR_LOCK_VIOLATION)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn busy() -> io::Error {
        io::Error::from_raw_os_error(32)
    }

    #[test]
    fn host_settings_file_tries_a_held_rename_again_after_each_delay() {
        let mut tries = 0;
        let mut waits = Vec::new();
        let renamed = rename_with(
            &RETRY_DELAYS_MS,
            || {
                tries += 1;
                if tries < 4 { Err(busy()) } else { Ok(()) }
            },
            |delay| waits.push(delay),
        );
        assert!(renamed.is_ok());
        assert_eq!(tries, 4);
        assert_eq!(waits, [10, 20, 40]);
    }

    #[test]
    fn host_settings_file_gives_up_after_the_last_delay() {
        let mut tries = 0;
        let mut waits = Vec::new();
        let renamed = rename_with(
            &RETRY_DELAYS_MS,
            || {
                tries += 1;
                Err(io::Error::from_raw_os_error(5))
            },
            |delay| waits.push(delay),
        );
        assert_eq!(renamed.unwrap_err().raw_os_error(), Some(5));
        assert_eq!(tries, 6, "once per delay and once after the last");
        assert_eq!(waits, RETRY_DELAYS_MS);
    }

    #[test]
    fn host_settings_file_returns_any_other_rename_error_at_once() {
        let mut tries = 0;
        let renamed = rename_with(
            &RETRY_DELAYS_MS,
            || {
                tries += 1;
                Err(io::Error::from(io::ErrorKind::NotFound))
            },
            |_| panic!("no wait for an error that isn't a held file"),
        );
        assert_eq!(renamed.unwrap_err().kind(), io::ErrorKind::NotFound);
        assert_eq!(tries, 1);
    }

    #[test]
    fn host_settings_file_tries_a_rename_once_without_delays() {
        let mut tries = 0;
        let renamed = rename_with(
            &[],
            || {
                tries += 1;
                Err(busy())
            },
            |_| panic!("no delays, no wait"),
        );
        assert!(renamed.is_err());
        assert_eq!(tries, 1);
    }
}
