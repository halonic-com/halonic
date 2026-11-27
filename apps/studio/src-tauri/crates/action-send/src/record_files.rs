//! Each action request's record, as one JSON-lines file per request in a
//! folder only the user can read (architecture note on HAL-17491, 4.2;
//! the `ActionRecords` port). The file is named by the SHA-256 of the
//! request's id, so no id can name a path. Only events the allow-list
//! takes are written, and only those are read back. A finished request's
//! record is deleted 90 days after its `action.finished`.

use std::fs::{self, DirBuilder, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::record_check::{check_record_event, check_request_id, seconds_of, text_field};

/// How long a finished request's record is kept after its `action.finished`.
pub const KEEP_FINISHED_SECONDS: u64 = 90 * 24 * 60 * 60;

/// The largest a request's record may grow; a request has at most 100
/// steps, so a real one stays far below it.
pub const MAX_RECORD_BYTES: u64 = 1024 * 1024;

const EXTENSION: &str = "jsonl";

/// Why a record call did nothing.
#[derive(Debug, PartialEq, Eq)]
pub enum RecordError {
    /// The allow-list refused the event or the request id: each problem
    /// names a field, never its value.
    Refused(Vec<String>),
    /// The request's record has reached [`MAX_RECORD_BYTES`].
    Full,
    /// The folder or the file couldn't be read or written.
    Storage(String),
}

impl RecordError {
    /// A stable name for the page: `refused-event`, `record-full` or `storage`.
    pub fn kind(&self) -> &'static str {
        match self {
            RecordError::Refused(_) => "refused-event",
            RecordError::Full => "record-full",
            RecordError::Storage(_) => "storage",
        }
    }
}

impl std::fmt::Display for RecordError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RecordError::Refused(problems) => {
                write!(formatter, "action event refused: {}", problems.join("; "))
            }
            RecordError::Full => write!(formatter, "the request's record is full"),
            RecordError::Storage(message) => write!(formatter, "{message}"),
        }
    }
}

fn storage(step: &str) -> impl Fn(std::io::Error) -> RecordError + '_ {
    move |error| RecordError::Storage(format!("{step}: {error}"))
}

/// A request's events read back, and how many lines were dropped because
/// the allow-list no longer takes them (a hand edit, or a broken write).
#[derive(Debug, Default, PartialEq)]
pub struct Record {
    pub events: Vec<Value>,
    pub dropped: usize,
}

/// The record files in one folder. Calls aren't locked against each other:
/// the shell runs them one at a time.
pub struct RecordFiles {
    folder: PathBuf,
}

impl RecordFiles {
    /// The records in `folder`, which is made, readable by the user only,
    /// on the first write.
    pub fn new(folder: PathBuf) -> Self {
        Self { folder }
    }

    fn file_of(&self, request: &str) -> PathBuf {
        let digest = Sha256::digest(request.as_bytes());
        let name: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
        self.folder.join(format!("{name}.{EXTENSION}"))
    }

    /// Adds one event to its request's record.
    ///
    /// # Errors
    ///
    /// [`RecordError::Refused`] for an event the allow-list refuses, and
    /// then nothing is written; [`RecordError::Full`] or
    /// [`RecordError::Storage`] when it can't be written.
    pub fn append(&self, event: &Value) -> Result<(), RecordError> {
        check_record_event(event).map_err(RecordError::Refused)?;
        let request = event
            .as_object()
            .map_or("", |fields| text_field(fields, "request"));
        let file = self.file_of(request);
        let mut line = serde_json::to_string(event).map_err(|error| {
            RecordError::Storage(format!("the event can't be written: {error}"))
        })?;
        line.push('\n');
        make_private_folder(&self.folder)?;
        let size = plain_file_size(&file)?.unwrap_or(0);
        if size + line.len() as u64 > MAX_RECORD_BYTES {
            return Err(RecordError::Full);
        }
        let mut options = OpenOptions::new();
        options.append(true).create(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
        let mut opened = options.open(&file).map_err(storage("open the record"))?;
        opened
            .write_all(line.as_bytes())
            .and_then(|()| opened.sync_data())
            .map_err(storage("write the record"))
    }

    /// A request's events, oldest first; empty for a request with no
    /// record, or whose record was deleted because it finished more than
    /// 90 days before `now` (seconds since 1970).
    ///
    /// # Errors
    ///
    /// [`RecordError::Refused`] for a request id the allow-list refuses;
    /// [`RecordError::Storage`] when the file can't be read.
    pub fn read(&self, request: &str, now: u64) -> Result<Record, RecordError> {
        check_request_id(request).map_err(|problem| RecordError::Refused(vec![problem]))?;
        let file = self.file_of(request);
        let record = read_file(&file, Some(request))?;
        if is_expired(&record.events, now) {
            remove_file(&file)?;
            return Ok(Record::default());
        }
        Ok(record)
    }

    /// Deletes every record that finished more than 90 days before `now`.
    ///
    /// # Returns
    ///
    /// How many were deleted, and a line for each file that couldn't be
    /// read or deleted.
    pub fn sweep(&self, now: u64) -> (usize, Vec<String>) {
        let entries = match fs::read_dir(&self.folder) {
            Ok(entries) => entries,
            Err(error) if error.kind() == ErrorKind::NotFound => return (0, Vec::new()),
            Err(error) => return (0, vec![format!("read the records folder: {error}")]),
        };
        let mut deleted = 0;
        let mut problems = Vec::new();
        for entry in entries.flatten() {
            let file = entry.path();
            if file
                .extension()
                .is_none_or(|extension| extension != EXTENSION)
            {
                continue;
            }
            let swept = read_file(&file, None).and_then(|record| {
                if !is_expired(&record.events, now) {
                    return Ok(false);
                }
                remove_file(&file).map(|()| true)
            });
            match swept {
                Ok(true) => deleted += 1,
                Ok(false) => {}
                Err(error) => problems.push(error.to_string()),
            }
        }
        (deleted, problems)
    }
}

/// Reads a record file's lines that the allow-list takes, and, when
/// `request` is given, that belong to it.
fn read_file(file: &Path, request: Option<&str>) -> Result<Record, RecordError> {
    if plain_file_size(file)?.is_none() {
        return Ok(Record::default());
    }
    let text = fs::read_to_string(file).map_err(storage("read the record"))?;
    let mut record = Record::default();
    for line in text.lines().filter(|line| !line.is_empty()) {
        match serde_json::from_str::<Value>(line) {
            Ok(event) if check_record_event(&event).is_ok() && belongs(&event, request) => {
                record.events.push(event);
            }
            _ => record.dropped += 1,
        }
    }
    Ok(record)
}

fn belongs(event: &Value, request: Option<&str>) -> bool {
    let fields = event.as_object();
    request.is_none_or(|request| fields.is_some_and(|f| text_field(f, "request") == request))
}

/// Whether the record finished, with its first `action.finished`, more
/// than [`KEEP_FINISHED_SECONDS`] before `now`.
fn is_expired(events: &[Value], now: u64) -> bool {
    let finished = events
        .iter()
        .filter_map(Value::as_object)
        .find_map(|fields| {
            (text_field(fields, "type") == "action.finished")
                .then(|| seconds_of(text_field(fields, "at")))
                .flatten()
        });
    finished.is_some_and(|at| now.saturating_sub(at) >= KEEP_FINISHED_SECONDS)
}

/// The file's size, `None` when it isn't there. Anything but a plain file
/// in its place, such as a link, is refused rather than followed.
fn plain_file_size(file: &Path) -> Result<Option<u64>, RecordError> {
    match fs::symlink_metadata(file) {
        Ok(found) if found.file_type().is_file() => Ok(Some(found.len())),
        Ok(_) => Err(RecordError::Storage(
            "a record's place holds something that isn't a plain file".to_owned(),
        )),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(storage("look up the record")(error)),
    }
}

fn remove_file(file: &Path) -> Result<(), RecordError> {
    match fs::remove_file(file) {
        Err(error) if error.kind() != ErrorKind::NotFound => {
            Err(storage("delete the record")(error))
        }
        _ => Ok(()),
    }
}

/// Makes the folder and its parents, and keeps the folder readable by the
/// user only on Unix, also when it was made wider before.
fn make_private_folder(folder: &Path) -> Result<(), RecordError> {
    let mut builder = DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder
        .create(folder)
        .map_err(storage("make the records folder"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(folder, fs::Permissions::from_mode(0o700))
            .map_err(storage("make the records folder private"))?;
    }
    Ok(())
}
