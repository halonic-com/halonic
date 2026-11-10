use super::{format_iso, parse_iso};

/// Times and the milliseconds `Date.parse` gives for them in Node.
const READ_BY_V8: &[(&str, i64)] = &[
    ("2026-11-10T12:00:00.000Z", 1_794_312_000_000),
    ("2000-02-29T12:00:00.123Z", 951_825_600_123),
    ("1969-12-31T23:59:59.999Z", -1),
    ("0000-01-01T00:00:00.000Z", -62_167_219_200_000),
    ("9999-12-31T23:59:59.999Z", 253_402_300_799_999),
    ("2026-11-10T13:00+01:00", 1_794_312_000_000),
    ("2026-02-30T11:59:55Z", 1_772_452_795_000),
    ("2026-11-10T24:00:00Z", 1_794_355_200_000),
    ("2026-11", 1_793_491_200_000),
    ("2026", 1_767_225_600_000),
];

#[test]
fn run_lock_reads_times_as_date_parse_does() {
    for &(text, ms) in READ_BY_V8 {
        assert_eq!(parse_iso(text), Some(ms), "{text}");
    }
}

#[test]
fn run_lock_reads_no_time_where_date_parse_gives_nan() {
    for text in [
        "",
        "yesterday",
        "2026-11-10T24:00:01Z",
        "2026-11-10T12:60:00Z",
        "2026-02-32T00:00:00Z",
        "2026-11-10T12:00:00+01",
        "2026-11-10T12:00:00.Z",
        "2026-11-10T12:00:00ZZ",
    ] {
        assert_eq!(parse_iso(text), None, "{text}");
    }
}

#[test]
fn run_lock_writes_times_as_to_iso_string_does() {
    for &(text, ms) in &READ_BY_V8[..5] {
        assert_eq!(format_iso(ms), text);
    }
}

#[test]
fn run_lock_reads_back_every_time_it_writes() {
    // A step that isn't a whole number of days, hours or seconds.
    let step = 86_399_997_i64 * 7;
    let mut ms = -62_167_219_200_000;
    while ms < 253_402_300_799_999 {
        assert_eq!(parse_iso(&format_iso(ms)), Some(ms), "{ms}");
        ms += step * 101;
    }
}
