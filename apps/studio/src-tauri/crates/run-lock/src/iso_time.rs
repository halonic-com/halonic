//! Times as ISO 8601 text in UTC, written as JavaScript's `toISOString`
//! writes them and read as `Date.parse` reads the forms adapters write.

const DAY_MS: i64 = 86_400_000;
const HOUR_MS: i64 = 3_600_000;
const MINUTE_MS: i64 = 60_000;
const SECOND_MS: i64 = 1_000;

/// Milliseconds since 1970 as `toISOString` writes them, for example
/// `2026-11-10T12:00:00.000Z`.
pub(crate) fn format_iso(ms: i64) -> String {
    let (year, month, day) = civil_from_days(ms.div_euclid(DAY_MS));
    let in_day = ms.rem_euclid(DAY_MS);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        in_day / HOUR_MS,
        in_day / MINUTE_MS % 60,
        in_day / SECOND_MS % 60,
        in_day % SECOND_MS,
    )
}

/// The time `text` names, in milliseconds since 1970, as `Date.parse` reads
/// it: a date (`2026-11-10`, `2026-11` or `2026`, as UTC), optionally
/// followed by `T`, `HH:mm`, optional seconds and fraction, and `Z` or an
/// offset such as `+01:00`. Like V8, it takes `t`, `z` and a space too,
/// keeps a fraction's first three digits and lets a day past the month's
/// end run into the next month.
///
/// `None` for anything else. `Date.parse` reads a few more forms, such as a
/// time without `Z` (local time) or `+0100`; no adapter writes them.
pub(crate) fn parse_iso(text: &str) -> Option<i64> {
    let mut reader = Reader(text.as_bytes());
    let year = reader.number(4)?;
    let (mut month, mut day) = (1, 1);
    if reader.take(b"-").is_some() {
        month = reader.number(2)?;
        if reader.take(b"-").is_some() {
            day = reader.number(2)?;
        }
    }
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let date = (days_from_civil(year, month) + day - 1) * DAY_MS;
    if reader.is_done() {
        return Some(date);
    }
    reader.take(b"Tt ")?;
    let time = read_time(&mut reader)?;
    let offset = read_offset(&mut reader)?;
    reader.is_done().then_some(date + time - offset)
}

/// `HH:mm`, then optionally `:ss` and `.fraction`, as milliseconds into the
/// day. `24:00` is the end of the day, as in `Date.parse`.
fn read_time(reader: &mut Reader) -> Option<i64> {
    let hour = reader.number(2)?;
    reader.take(b":")?;
    let minute = reader.number(2)?;
    let (mut second, mut millis) = (0, 0);
    if reader.take(b":").is_some() {
        second = reader.number(2)?;
        if reader.take(b".").is_some() {
            millis = reader.fraction_ms()?;
        }
    }
    let in_range = hour <= 23 && minute <= 59 && second <= 59;
    let end_of_day = hour == 24 && minute == 0 && second == 0 && millis == 0;
    (in_range || end_of_day)
        .then_some(hour * HOUR_MS + minute * MINUTE_MS + second * SECOND_MS + millis)
}

/// `Z`, or `+HH:mm` or `-HH:mm`, as milliseconds ahead of UTC.
fn read_offset(reader: &mut Reader) -> Option<i64> {
    let sign = match reader.take(b"Zz+-")? {
        b'+' => 1,
        b'-' => -1,
        _ => return Some(0),
    };
    let hours = reader.number(2)?;
    reader.take(b":")?;
    let minutes = reader.number(2)?;
    (hours <= 23 && minutes <= 59).then_some(sign * (hours * HOUR_MS + minutes * MINUTE_MS))
}

/// Text read from the front, one part at a time.
struct Reader<'a>(&'a [u8]);

impl Reader<'_> {
    /// Takes the next byte when it is one of `any`.
    fn take(&mut self, any: &[u8]) -> Option<u8> {
        let (&first, rest) = self.0.split_first()?;
        any.contains(&first).then(|| {
            self.0 = rest;
            first
        })
    }

    /// Takes exactly `digits` decimal digits.
    fn number(&mut self, digits: usize) -> Option<i64> {
        let head = self.0.get(..digits)?;
        if !head.iter().all(u8::is_ascii_digit) {
            return None;
        }
        self.0 = &self.0[digits..];
        Some(
            head.iter()
                .fold(0, |value, digit| value * 10 + i64::from(digit - b'0')),
        )
    }

    /// Takes one or more digits of a fraction of a second, as milliseconds.
    fn fraction_ms(&mut self) -> Option<i64> {
        let count = self
            .0
            .iter()
            .take_while(|byte| byte.is_ascii_digit())
            .count();
        if count == 0 {
            return None;
        }
        let digits = &self.0[..count];
        self.0 = &self.0[count..];
        let first_three = digits.iter().chain(b"00").take(3);
        Some(first_three.fold(0, |value, digit| value * 10 + i64::from(digit - b'0')))
    }

    fn is_done(&self) -> bool {
        self.0.is_empty()
    }
}

/// Days since 1970-01-01 of the first day of `month` in `year` (proleptic
/// Gregorian calendar, Howard Hinnant's `days_from_civil`).
fn days_from_civil(year: i64, month: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let day_of_year = (153 * ((month + 9) % 12) + 2) / 5;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// The year, month and day of a day counted from 1970-01-01, the inverse of
/// `days_from_civil`.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let days = days + 719_468;
    let era = days.div_euclid(146_097);
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
    let month = if shifted_month < 10 {
        shifted_month + 3
    } else {
        shifted_month - 9
    };
    let year = year_of_era + era * 400;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

#[cfg(test)]
#[path = "iso_time_tests.rs"]
mod tests;
