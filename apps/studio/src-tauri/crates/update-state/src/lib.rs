//! What the Studio shell's updater knows (HAL-1206): the states it shows the
//! page (flow-install-update 4.3), when it checks (4.1), and its record of
//! installs and bad signatures (4.3, 4.6), and FS6's settings backup. Plain
//! Rust with no Tauri types: the shell runs the checks with
//! `tauri-plugin-updater`, keeps the record in the profile, and asks this
//! crate what to do. Only `migrate_settings_file` touches files.

mod record;
mod settings;
mod status;
mod version;

use std::time::Duration;

pub use record::{
    BadSignature, CheckResult, FORMAT, InstallRecord, MAX_BAD_SIGNATURES, RecordRead, StartOutcome,
    UpdaterRecord, read_record, record_text,
};
pub use settings::{Migrated, backup_path, migrate_settings_file};
pub use status::{
    CheckFailure, DownloadFailure, JustUpdated, Unit, UpdateState, UpdateStatus, notes_url,
};
pub use version::Version;

/// The first automatic check waits this long after the window is ready, so
/// it is never on the start-up path.
pub const FIRST_CHECK_AFTER: Duration = Duration::from_secs(10);

/// Then it checks again once this long has passed since the last check.
pub const CHECK_EVERY: Duration = Duration::from_secs(24 * 60 * 60);

/// One check gives up after this long, with no retry: the next check is it.
pub const CHECK_TIME_LIMIT: Duration = Duration::from_secs(15);

/// A download that gets no data for this long stops as `stalled`.
pub const DOWNLOAD_STALL_LIMIT: Duration = Duration::from_secs(60);

/// A download reports its progress at most this often.
pub const PROGRESS_EVERY: Duration = Duration::from_millis(500);

/// Whether an automatic check is due. Times are milliseconds since 1970,
/// read from the wall clock, so a computer that slept past the 24 hours
/// checks when it wakes. A last check in the future (the clock went back)
/// counts as due.
pub fn check_due(
    automatic: bool,
    since_ready: Duration,
    checked_this_run: bool,
    last_attempt: Option<u64>,
    now: u64,
) -> bool {
    if !automatic || since_ready < FIRST_CHECK_AFTER {
        return false;
    }
    if !checked_this_run {
        return true;
    }
    let every = u64::try_from(CHECK_EVERY.as_millis()).unwrap_or(u64::MAX);
    match last_attempt {
        None => true,
        Some(last) if last > now => true,
        Some(last) => now - last >= every,
    }
}

#[cfg(test)]
mod tests {
    use super::{CHECK_EVERY, FIRST_CHECK_AFTER, check_due};
    use std::time::Duration;

    const DAY: u64 = 24 * 60 * 60 * 1000;
    const NOW: u64 = 100 * DAY;

    #[test]
    fn update_state_checks_ten_seconds_after_ready_then_once_a_day() {
        let ready = FIRST_CHECK_AFTER;
        assert!(!check_due(
            true,
            ready - Duration::from_millis(1),
            false,
            None,
            NOW
        ));
        assert!(check_due(true, ready, false, Some(NOW - 1), NOW));
        assert!(!check_due(true, ready, true, Some(NOW - DAY + 1), NOW));
        assert!(check_due(true, ready, true, Some(NOW - DAY), NOW));
        assert!(check_due(true, ready, true, None, NOW));
        assert_eq!(CHECK_EVERY.as_millis(), u128::from(DAY));
    }

    #[test]
    fn update_state_never_checks_by_itself_when_automatic_is_off() {
        assert!(!check_due(
            false,
            Duration::from_secs(3600),
            false,
            None,
            NOW
        ));
        assert!(!check_due(
            false,
            Duration::from_secs(3600),
            true,
            Some(0),
            NOW
        ));
    }

    #[test]
    fn update_state_checks_when_the_clock_went_back() {
        assert!(check_due(true, FIRST_CHECK_AFTER, true, Some(NOW + 1), NOW));
    }
}
