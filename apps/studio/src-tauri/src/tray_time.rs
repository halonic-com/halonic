//! When an engine's next routine is due, as the tray shows it: "next
//! routine at 14:00" on this computer's clock (HAL-18279). The engine sends
//! a UTC time in its `health`; a time that doesn't parse, such as the 31st
//! of February, counts as no next routine.

use std::fmt;

use chrono::{DateTime, Local, TimeZone, Timelike};

/// A time of day on a clock, shown as `14:00`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ClockTime {
    pub hour: u32,
    pub minute: u32,
}

impl fmt::Display for ClockTime {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:02}:{:02}", self.hour, self.minute)
    }
}

/// One engine's next routine: when, in Unix seconds, to find the earliest
/// of several engines, and on the clock, to show.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NextRoutine {
    pub at: i64,
    pub clock: ClockTime,
}

/// The next routine at `iso`, on this computer's clock.
pub fn next_routine(iso: &str) -> Option<NextRoutine> {
    next_routine_in(iso, &Local)
}

/// The next routine at `iso`, on the clock of `zone`.
pub fn next_routine_in<Z: TimeZone>(iso: &str, zone: &Z) -> Option<NextRoutine> {
    let at = DateTime::parse_from_rfc3339(iso).ok()?;
    let local = at.with_timezone(zone);
    Some(NextRoutine {
        at: at.timestamp(),
        clock: ClockTime {
            hour: local.hour(),
            minute: local.minute(),
        },
    })
}

#[cfg(test)]
mod tests {
    use chrono::FixedOffset;

    use super::*;

    fn hours(offset: i32) -> FixedOffset {
        FixedOffset::east_opt(offset * 3600).unwrap()
    }

    /// `studio.src-tauri.tray-status-lines`: the engine's UTC time on the
    /// computer's clock.
    #[test]
    fn tray_status_lines_show_the_next_routine_on_the_local_clock() {
        let next = next_routine_in("2026-11-25T13:00:00.000Z", &hours(1)).unwrap();
        assert_eq!(next.clock.to_string(), "14:00");
        assert_eq!(next.at, 1_795_611_600);
        let early = next_routine_in("2026-11-25T23:05:00.000Z", &hours(-8)).unwrap();
        assert_eq!(early.clock.to_string(), "15:05");
    }

    /// `studio.src-tauri.tray-status-lines`: a time that doesn't parse is no
    /// next routine, never a panic.
    #[test]
    fn tray_status_lines_skip_a_time_that_does_not_parse() {
        for iso in ["2026-02-31T14:00:00.000Z", "", "14:00"] {
            assert_eq!(next_routine_in(iso, &hours(0)), None, "{iso}");
        }
    }
}
