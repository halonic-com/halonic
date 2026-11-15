//! Whether the distro's Debian security updates are overdue (security
//! review W2, HAL-5407). The runtime updater only runs them while no sandbox
//! session runs, and an agent could hold them off by keeping a process named
//! `bwrap` alive, so Studio's trust check reads when they last ran
//! (`halonic-runtime status`, `securityUpdated`) and warns when that is too
//! long ago.

use serde_json::Value;

/// How long security updates may go without running before Studio warns.
pub const OVERDUE_AFTER_DAYS: i64 = 7;

const SECONDS_PER_DAY: i64 = 86_400;

/// What the updater's status says about security updates.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SecurityUpdates {
    /// They ran within [`OVERDUE_AFTER_DAYS`].
    Current,
    /// They are overdue. `last` is when they last ran (UTC, as the updater
    /// printed it), or `None` when they never did or the status didn't say.
    Overdue { last: Option<String> },
}

/// Reads `securityUpdated` from the updater's `status` output. Anything it
/// can't read counts as overdue: a warning for a status we don't understand
/// is better than silence.
///
/// `now` is the time in Unix seconds.
#[must_use]
pub fn security_updates(status: &str, now: i64) -> SecurityUpdates {
    let last = serde_json::from_str::<Value>(status)
        .ok()
        .and_then(|value| value.get("securityUpdated")?.as_str().map(str::to_owned))
        .filter(|stamp| !stamp.is_empty());
    let age = last
        .as_deref()
        .and_then(unix_seconds)
        .map(|then| now.saturating_sub(then));
    match age {
        Some(age) if age <= OVERDUE_AFTER_DAYS * SECONDS_PER_DAY => SecurityUpdates::Current,
        _ => SecurityUpdates::Overdue { last },
    }
}

/// Unix seconds of `YYYY-MM-DDTHH:MM:SSZ`, the updater's format.
fn unix_seconds(stamp: &str) -> Option<i64> {
    let (date, time) = stamp.strip_suffix('Z')?.split_once('T')?;
    let mut date = date.split('-').map(|part| part.parse::<i64>().ok());
    let (year, month, day) = (date.next()??, date.next()??, date.next()??);
    let mut time = time.split(':').map(|part| part.parse::<i64>().ok());
    let (hour, minute, second) = (time.next()??, time.next()??, time.next()??);
    if date.next().is_some()
        || time.next().is_some()
        || !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || !(0..24).contains(&hour)
        || !(0..60).contains(&minute)
        || !(0..61).contains(&second)
    {
        return None;
    }
    Some(days_from_civil(year, month, day) * SECONDS_PER_DAY + hour * 3600 + minute * 60 + second)
}

/// Days from 1970-01-01 to a date in the proleptic Gregorian calendar.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let shifted_month = if month > 2 { month - 3 } else { month + 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

#[cfg(test)]
mod tests {
    use super::{SecurityUpdates, security_updates, unix_seconds};

    /// 2026-11-15T12:00:00Z.
    const NOW: i64 = 1_794_744_000;

    fn status(stamp: &str) -> String {
        format!(r#"{{"current":"1.2.0","previous":"1.0.0","securityUpdated":"{stamp}"}}"#)
    }

    #[test]
    fn reads_the_updaters_timestamp() {
        assert_eq!(unix_seconds("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(unix_seconds("2026-11-15T12:00:00Z"), Some(NOW));
    }

    #[test]
    fn updates_from_the_last_week_are_current() {
        for stamp in ["2026-11-15T11:00:00Z", "2026-11-09T12:00:00Z"] {
            assert_eq!(
                security_updates(&status(stamp), NOW),
                SecurityUpdates::Current
            );
        }
    }

    #[test]
    fn older_updates_are_overdue_and_say_when_they_ran() {
        assert_eq!(
            security_updates(&status("2026-11-08T11:59:59Z"), NOW),
            SecurityUpdates::Overdue {
                last: Some("2026-11-08T11:59:59Z".to_owned())
            }
        );
    }

    #[test]
    fn updates_that_never_ran_or_a_status_it_cannot_read_are_overdue() {
        let never = SecurityUpdates::Overdue { last: None };
        assert_eq!(security_updates(&status(""), NOW), never);
        assert_eq!(security_updates(r#"{"current":"1.2.0"}"#, NOW), never);
        assert_eq!(security_updates("not json", NOW), never);
        assert_eq!(
            security_updates(&status("yesterday"), NOW),
            SecurityUpdates::Overdue {
                last: Some("yesterday".to_owned())
            }
        );
    }
}
