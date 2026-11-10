use super::{ACCESS_DENIED, BusyRetry, SHARING_VIOLATION};
use std::cell::Cell;
use std::io::{self, ErrorKind};
use std::time::Duration;

/// Windows rules with a limit long enough for a few tries.
const WINDOWS: BusyRetry = BusyRetry {
    windows: true,
    limit: Duration::from_secs(5),
};

/// A step that fails with the system error `code` `failures` times, then
/// succeeds, and counts how often it ran.
fn failing_step(
    code: i32,
    failures: usize,
    runs: &Cell<usize>,
) -> impl FnMut() -> io::Result<&'static str> {
    move || {
        runs.set(runs.get() + 1);
        if runs.get() <= failures {
            Err(io::Error::from_raw_os_error(code))
        } else {
            Ok("done")
        }
    }
}

#[test]
fn run_lock_tries_again_while_windows_denies_access_to_a_delete_pending_lock() {
    let runs = Cell::new(0);
    let done = WINDOWS.run(failing_step(ACCESS_DENIED, 2, &runs));
    assert_eq!(done.expect("done after the lock is gone"), "done");
    assert_eq!(runs.get(), 3);
}

#[test]
fn run_lock_tries_again_while_another_program_has_the_lock_open() {
    let runs = Cell::new(0);
    let done = WINDOWS.run(failing_step(SHARING_VIOLATION, 2, &runs));
    assert_eq!(done.expect("done after the program lets go"), "done");
    assert_eq!(runs.get(), 3);
}

#[test]
fn run_lock_gives_the_error_once_the_lock_stays_busy_past_the_limit() {
    let short = BusyRetry {
        windows: true,
        limit: Duration::from_millis(50),
    };
    let runs = Cell::new(0);
    let error = short
        .run(failing_step(ACCESS_DENIED, usize::MAX, &runs))
        .expect_err("a real refusal");
    assert_eq!(error.raw_os_error(), Some(ACCESS_DENIED));
    assert!(runs.get() > 1);
}

#[test]
fn run_lock_gives_other_errors_than_busy_at_once() {
    let runs = Cell::new(0);
    let missing = WINDOWS.run(|| -> io::Result<()> {
        runs.set(runs.get() + 1);
        Err(ErrorKind::NotFound.into())
    });
    assert_eq!(missing.expect_err("missing").kind(), ErrorKind::NotFound);
    assert_eq!(runs.get(), 1);
}

#[test]
fn run_lock_never_retries_busy_codes_off_windows_where_they_mean_something_else() {
    let elsewhere = BusyRetry {
        windows: false,
        limit: Duration::from_secs(5),
    };
    let runs = Cell::new(0);
    let error = elsewhere
        .run(failing_step(ACCESS_DENIED, 2, &runs))
        .expect_err("not retried");
    assert_eq!(error.raw_os_error(), Some(ACCESS_DENIED));
    assert_eq!(runs.get(), 1);
}
