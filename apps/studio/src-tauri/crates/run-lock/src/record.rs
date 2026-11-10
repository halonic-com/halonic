//! The lock record and when a lock is stale, as `RunLockRecord` in
//! `@halonicjs/ports` sets them out. `withRunLock` in `fs-node` follows the
//! same rules, and both read the cases in `tests/fixtures/run-lock-cases.json`.

use crate::iso_time::{format_iso, parse_iso};
use serde::Serialize;
use serde_json::Value;

/// The format version of the record this crate writes (`runLockFormat`).
const FORMAT: i64 = 1;

/// How old a lock may get before any writer may remove it
/// (`runLockStaleAfterMs`).
pub const STALE_AFTER_MS: i64 = 10_000;

/// How old a lock's takeover file may get before any writer may remove it
/// (`runLockTakeoverStaleAfterMs`). Removing a stale lock takes
/// milliseconds, and up to 2 seconds a step on Windows while a file is busy,
/// so a takeover file this old was left by a writer that crashed while
/// removing a lock.
pub const TAKEOVER_STALE_AFTER_MS: i64 = 5_000;

/// JavaScript's `Number.MAX_SAFE_INTEGER`.
const MAX_SAFE_INTEGER: i64 = (1 << 53) - 1;

/// The largest process id Node's `process.kill` takes (`i32::MAX`). It
/// refuses larger ids, so a lock that names one counts as held by no running
/// process. Every id [`is_stale`] asks about is in `1..=MAX_PROCESS_ID`, so it
/// fits an `i32` for `kill` and is never a negative process group id.
const MAX_PROCESS_ID: i64 = i32::MAX as i64;

/// A valid record: the writer's process id and host name, and when it took
/// the lock, as written.
#[derive(Debug, PartialEq)]
pub struct LockRecord {
    pub pid: i64,
    pub host: String,
    pub taken_at: String,
}

/// A lock file as found on disk.
pub struct FoundLock {
    /// The file's text, as the writer that took the lock wrote it.
    pub text: String,
    /// The record in it, or `None` when the text isn't one.
    pub record: Option<LockRecord>,
    /// When the file was last changed, in milliseconds since 1970.
    pub changed_at_ms: i64,
}

impl FoundLock {
    pub fn new(text: String, changed_at_ms: i64) -> Self {
        let record = parse_record(&text);
        Self {
            text,
            record,
            changed_at_ms,
        }
    }
}

/// The text a writer puts in the lock file. It is the same, byte for byte,
/// as `JSON.stringify` of the record `fs-node` writes.
pub fn record_text(pid: u32, host: &str, now_ms: i64) -> String {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Written<'a> {
        version: i64,
        pid: u32,
        host: &'a str,
        taken_at: String,
    }
    let written = Written {
        version: FORMAT,
        pid,
        host,
        taken_at: format_iso(now_ms),
    };
    serde_json::to_string(&written).expect("a record of numbers and text always serializes")
}

/// The record in a lock file, or `None` when the text isn't one. Like
/// `fs-node`, it takes any JSON object whose `version` is a whole number,
/// `pid` a whole number above 0 (JavaScript's safe range), and `host` and
/// `takenAt` text; other fields don't matter.
pub fn parse_record(text: &str) -> Option<LockRecord> {
    let value: Value = serde_json::from_str(text).ok()?;
    let fields = value.as_object()?;
    safe_integer(fields.get("version")?)?;
    let pid = safe_integer(fields.get("pid")?).filter(|&pid| pid > 0)?;
    let host = fields.get("host")?.as_str()?.to_owned();
    let taken_at = fields.get("takenAt")?.as_str()?.to_owned();
    Some(LockRecord {
        pid,
        host,
        taken_at,
    })
}

/// The number as an `i64`, when JavaScript's `Number.isSafeInteger` takes
/// it: `1.0` and `1e3` count, `1.5` and 2⁵³ don't.
fn safe_integer(value: &Value) -> Option<i64> {
    let number = value.as_number()?;
    let whole = match number.as_i64() {
        Some(whole) => whole,
        None if number.is_u64() => return None,
        None => {
            let float = number.as_f64()?;
            if float.fract() != 0.0 || float.abs() > MAX_SAFE_INTEGER as f64 {
                return None;
            }
            float as i64
        }
    };
    (whole.unsigned_abs() <= MAX_SAFE_INTEGER as u64).then_some(whole)
}

/// Whether a lock may be removed: taken more than [`STALE_AFTER_MS`] ago (or
/// as far in the future, a clock that was off), taken at a time that can't
/// be read, or taken on this computer by a process that no longer runs. A
/// file that holds no record yet may be one a writer is still writing, so
/// only its age counts.
///
/// `this_host` is `None` when this computer's name is unknown: every lock
/// then counts as another computer's.
pub fn is_stale(
    found: &FoundLock,
    now_ms: i64,
    this_host: Option<&str>,
    process_runs: impl Fn(u32) -> bool,
) -> bool {
    let taken_at = match &found.record {
        Some(record) => parse_iso(&record.taken_at),
        None => Some(found.changed_at_ms),
    };
    // A time that can't be read is stale at once, as `Date.parse`'s NaN is.
    let Some(taken_at) = taken_at else {
        return true;
    };
    if now_ms.abs_diff(taken_at) > STALE_AFTER_MS.unsigned_abs() {
        return true;
    }
    match &found.record {
        Some(record) if Some(record.host.as_str()) == this_host => {
            let runs =
                record.pid <= MAX_PROCESS_ID && u32::try_from(record.pid).is_ok_and(process_runs);
            !runs
        }
        _ => false,
    }
}

#[cfg(test)]
#[path = "record_tests.rs"]
mod tests;
