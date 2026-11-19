use std::time::{SystemTime, UNIX_EPOCH};

/// The longest message a line keeps, in bytes. A longer one is cut, so one
/// runaway message can't fill the log.
pub const MAX_LINE_BYTES: usize = 4 * 1024;

/// One line of the log: `<UTC time> <source>: <message>` and a newline. Line
/// breaks in the message become spaces, so each record is one line, and a
/// message longer than [`MAX_LINE_BYTES`] is cut and marked.
pub fn log_line(at: SystemTime, source: &str, message: &str) -> String {
    let flat: String = message
        .chars()
        .map(|character| {
            if character == '\n' || character == '\r' {
                ' '
            } else {
                character
            }
        })
        .collect();
    let kept = if flat.len() > MAX_LINE_BYTES {
        let mut end = MAX_LINE_BYTES;
        while !flat.is_char_boundary(end) {
            end -= 1;
        }
        format!("{} (cut)", &flat[..end])
    } else {
        flat
    };
    format!("{} {source}: {kept}\n", utc_text(at))
}

/// `at` as `YYYY-MM-DDTHH:MM:SSZ`, in UTC. A time before 1970 reads as 1970.
fn utc_text(at: SystemTime) -> String {
    let seconds = at
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs());
    let (days, rest) = (seconds / 86_400, seconds % 86_400);
    let (year, month, day) = civil_date(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}

/// The calendar date `days` after 1970-01-01, by Howard Hinnant's
/// `civil_from_days`, for the dates a log can have (after 1970).
fn civil_date(days: u64) -> (u64, u64, u64) {
    let shifted = days + 719_468;
    let era = shifted / 146_097;
    let day_of_era = shifted % 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    let year = year_of_era + era * 400 + u64::from(month <= 2);
    (year, month, day)
}
