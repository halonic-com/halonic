use std::fs::{self, DirBuilder, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value};

use crate::error::TrustError;
use crate::record_file::{file_name, is_record_file, leading_location, record_text};

/// Trust records as files in one folder of the profile, `<profile>/trust`,
/// one JSON file per record, laid out as `FileTrustStore` in `fs-node` lays
/// them out (requirement `trust-files`).
///
/// A grant writes a temporary file and renames it over the record, so a
/// reader sees the old record or the new one, never half of one. The folder
/// is made readable by its owner only. It must never be inside a workspace,
/// or a workspace could trust itself.
#[derive(Debug, Clone)]
pub struct FileTrustStore {
    root: PathBuf,
}

impl FileTrustStore {
    /// A store over `root`, which is created on the first grant.
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// The record for `location`, or `None` when there is none. Locations
    /// are compared exactly as given: no case folding and no Unicode
    /// normalisation.
    pub fn get(&self, location: &str) -> Result<Option<Value>, TrustError> {
        let file = self.file_for(location);
        let text = match fs::read_to_string(&file) {
            Ok(text) => text,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(unreadable(Some(location), &file)),
        };
        parse_record(location, &file, &text).map(Some)
    }

    /// Saves a record, replacing any record for the same location, even
    /// one that can't be read.
    pub fn grant(&self, record: &Value) -> Result<(), TrustError> {
        let (location, fields) = checked_record(record)?;
        let file = self.file_for(location);
        create_private_folder(&self.root)?;
        write_replacing(&file, &record_text(location, fields))
    }

    /// Deletes the record for `location` without reading it, so a damaged
    /// record goes too. Revoking one that isn't there is not an error.
    pub fn revoke(&self, location: &str) -> Result<(), TrustError> {
        match fs::remove_file(self.file_for(location)) {
            Err(error) if error.kind() != ErrorKind::NotFound => Err(error.into()),
            _ => Ok(()),
        }
    }

    /// Every record, sorted by location in UTF-16 code-unit order, as
    /// JavaScript's `<` compares strings, so the page and the CLI list them
    /// alike. Only record files are read; other files are left alone.
    pub fn list(&self) -> Result<Vec<Value>, TrustError> {
        let entries = match fs::read_dir(&self.root) {
            Ok(entries) => entries,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error.into()),
        };
        let mut records = Vec::new();
        for entry in entries {
            let entry = entry?;
            let name = entry.file_name();
            let Some(name) = name.to_str().filter(|name| is_record_file(name)) else {
                continue;
            };
            let file = entry.path();
            let text = match fs::read_to_string(&file) {
                Ok(text) => text,
                // Revoked since the folder was read.
                Err(error) if error.kind() == ErrorKind::NotFound => continue,
                Err(_) => return Err(unreadable(None, &file)),
            };
            let Some(location) = leading_location(&text).filter(|found| file_name(found) == name)
            else {
                return Err(unreadable(None, &file));
            };
            let record = parse_record(&location, &file, &text)?;
            records.push((location, record));
        }
        records.sort_by(|left, right| utf16_order(&left.0, &right.0));
        Ok(records.into_iter().map(|(_, record)| record).collect())
    }

    fn file_for(&self, location: &str) -> PathBuf {
        self.root.join(file_name(location))
    }
}

/// Orders two locations by UTF-16 code unit, as JavaScript's `<` does.
/// Rust compares by code point, which puts U+FFFF before U+10000; UTF-16
/// puts U+10000 first, because its first unit is a surrogate below U+FFFF.
fn utf16_order(left: &str, right: &str) -> std::cmp::Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

/// The record's location and fields, or `InvalidRecord` when it isn't an
/// object with a text `location`.
fn checked_record(record: &Value) -> Result<(&str, &Map<String, Value>), TrustError> {
    let fields = record.as_object().ok_or(TrustError::InvalidRecord)?;
    let location = fields
        .get("location")
        .and_then(Value::as_str)
        .ok_or(TrustError::InvalidRecord)?;
    Ok((location, fields))
}

/// The record in a file's text, which must be an object for `location`.
fn parse_record(location: &str, file: &Path, text: &str) -> Result<Value, TrustError> {
    let Ok(record) = serde_json::from_str::<Value>(text) else {
        return Err(unreadable(Some(location), file));
    };
    if record.get("location").and_then(Value::as_str) != Some(location) {
        return Err(unreadable(Some(location), file));
    }
    Ok(record)
}

fn unreadable(location: Option<&str>, file: &Path) -> TrustError {
    TrustError::Unreadable {
        location: location.map(str::to_owned),
        file: file.to_owned(),
    }
}

/// Creates the folder, and any missing parents, readable by its owner only.
fn create_private_folder(folder: &Path) -> Result<(), TrustError> {
    let mut builder = DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(folder)?;
    Ok(())
}

/// Writes `text` to a new temporary file next to `file`, then renames it
/// over `file`, so a reader never sees half a record.
fn write_replacing(file: &Path, text: &str) -> Result<(), TrustError> {
    let temporary = temporary_for(file);
    if let Err(error) = write_then_rename(&temporary, file, text) {
        // A half-written temporary file must not stay behind. If removing
        // it fails too, the write's own error is the one to report.
        let _ = fs::remove_file(&temporary);
        return Err(error.into());
    }
    Ok(())
}

fn write_then_rename(temporary: &Path, file: &Path, text: &str) -> std::io::Result<()> {
    write_new(temporary, text)?;
    fs::rename(temporary, file)
}

/// Writes a file that must not exist yet, readable by its owner only, and
/// flushes it to disk before it is renamed into place.
fn write_new(file: &Path, text: &str) -> std::io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut opened = options.open(file)?;
    opened.write_all(text.as_bytes())?;
    opened.sync_all()
}

/// A temporary file name next to `file` that no other write uses: the
/// process id, a count within the process and the time. It doesn't look like
/// a record file, so `list` skips it if a crash leaves it behind.
fn temporary_for(file: &Path) -> PathBuf {
    static WRITES: AtomicU64 = AtomicU64::new(0);
    let count = WRITES.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_nanos());
    let mut name = file.file_name().unwrap_or_default().to_owned();
    name.push(format!(".{}-{count}-{nanos}.tmp", std::process::id()));
    file.with_file_name(name)
}
