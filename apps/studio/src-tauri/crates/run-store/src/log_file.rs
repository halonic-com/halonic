//! A run log on disk: one JSON event per line, each ending in a line break.
//! This side only finds the whole lines; the page reads them into events
//! with `parseLogLines` from the `RunStore` port.

use std::fs::{self, OpenOptions};
use std::io::{self, ErrorKind, Write};
use std::path::Path;

use crate::error::RunStoreError;

const LINE_BREAK: u8 = b'\n';

/// A log as read from disk.
pub(crate) struct LogFile {
    /// The whole lines, up to and including the last line break.
    pub(crate) lines: String,
    /// Whether bytes follow the last line break: a line a crash cut off.
    pub(crate) torn: bool,
}

impl LogFile {
    /// How many events the log holds: one per whole line.
    pub(crate) fn last_seq(&self) -> u64 {
        count_lines(&self.lines)
    }

    /// The log's size without its torn line, in bytes.
    pub(crate) fn intact_bytes(&self) -> u64 {
        self.lines.len() as u64
    }

    /// Whether this is the log of another run, whose id differs from
    /// `run_id` only in case, as a folder that ignores case (on Windows and
    /// macOS) opens it for `<run_id>.jsonl`. Told from the first line alone,
    /// as `isOtherRunsLog` in the `RunStore` port tells it: a first line
    /// that isn't an event with a run id is not another run's, and the page
    /// reports it when it reads the lines.
    pub(crate) fn is_other_runs(&self, run_id: &str) -> bool {
        let Some((first_line, _)) = self.lines.split_once('\n') else {
            return false;
        };
        let Ok(event) = serde_json::from_str::<serde_json::Value>(first_line) else {
            return false;
        };
        let Some(owner) = event.get("runId").and_then(serde_json::Value::as_str) else {
            return false;
        };
        // Run ids are ASCII only, so this is how every such folder compares them.
        owner != run_id && owner.eq_ignore_ascii_case(run_id)
    }
}

/// Reads the log at `file`, empty when it is missing. An event counts only
/// once its line break is written, so whatever follows the last one is left
/// out, even when it happens to be valid JSON.
pub(crate) fn read_log(file: &Path, name: &str) -> Result<LogFile, RunStoreError> {
    let mut bytes = match fs::read(file) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == ErrorKind::NotFound => Vec::new(),
        Err(error) => return Err(error.into()),
    };
    let intact = bytes
        .iter()
        .rposition(|&byte| byte == LINE_BREAK)
        .map_or(0, |last| last + 1);
    let torn = intact < bytes.len();
    bytes.truncate(intact);
    let lines = String::from_utf8(bytes).map_err(|_| RunStoreError::BrokenLog {
        file: name.to_owned(),
    })?;
    Ok(LogFile { lines, torn })
}

/// Whether `lines` are whole lines to append: at least one, none empty, each
/// ending in a line break.
pub(crate) fn are_whole_lines(lines: &str) -> bool {
    lines.ends_with('\n') && !lines.split_terminator('\n').any(str::is_empty)
}

pub(crate) fn count_lines(lines: &str) -> u64 {
    lines.bytes().filter(|&byte| byte == LINE_BREAK).count() as u64
}

/// Cuts the log back to `size` bytes: its torn line before an append, or
/// a failed append's partial lines.
pub(crate) fn cut_back(file: &Path, size: u64) -> io::Result<()> {
    OpenOptions::new().write(true).open(file)?.set_len(size)
}

/// Adds the lines to the log, all of them or none. A write can fail part-way
/// (a full disk, an I/O error) after some whole lines are out, and those
/// would count as stored; so on a failure the log is cut back to
/// `intact_bytes`, its size before this append, and the error is passed on.
pub(crate) fn append_lines(file: &Path, lines: &str, intact_bytes: u64) -> io::Result<()> {
    let written = OpenOptions::new()
        .append(true)
        .create(true)
        .open(file)
        .and_then(|mut log| log.write_all(lines.as_bytes()));
    if written.is_err() {
        // When cutting back fails too (the write failed before creating the
        // file, or it isn't writable), the write's own error is the one to
        // report; lines left behind then count as stored, as after a crash.
        let _ = cut_back(file, intact_bytes);
    }
    written
}
