//! FS6 (failure path 2): a new version that has to change a stored
//! settings file keeps the old one first, as `<name>.<old version>.bak` next
//! to it, and says which settings it couldn't carry over, so Studio can
//! show them. The backup stays until the person removes it.

use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{self, ErrorKind, Write};
use std::path::{Path, PathBuf};

/// What a migration made of one settings file's text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Migrated {
    /// The new text. The same text means nothing changes.
    pub text: String,
    /// The settings it couldn't carry over, by name.
    pub not_carried_over: Vec<String>,
}

/// `<name>.<old version>.bak`, next to `file`.
pub fn backup_path(file: &Path, old_version: &str) -> PathBuf {
    let mut name = file.file_name().map(OsString::from).unwrap_or_default();
    name.push(format!(".{old_version}.bak"));
    file.with_file_name(name)
}

/// Migrates the settings file `file`, written by `old_version`. A missing
/// file, or a migration that changes nothing, leaves the disk as it is.
/// Otherwise the old bytes go to [`backup_path`] first, never over a backup
/// already there, and the new text replaces the file through a temporary
/// file and a rename. If the backup can't be written, the file isn't
/// changed. Answers the settings the migration couldn't carry over.
pub fn migrate_settings_file(
    file: &Path,
    old_version: &str,
    migrate: impl FnOnce(&str) -> Migrated,
) -> io::Result<Vec<String>> {
    let text = match fs::read_to_string(file) {
        Ok(text) => text,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let migrated = migrate(&text);
    if migrated.text == text {
        return Ok(migrated.not_carried_over);
    }
    let backup = backup_path(file, old_version);
    match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&backup)
    {
        Ok(mut kept) => {
            kept.write_all(text.as_bytes())?;
            kept.sync_all()?;
        }
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error),
    }
    let mut temporary = file.as_os_str().to_owned();
    temporary.push(".tmp");
    let temporary = PathBuf::from(temporary);
    fs::write(&temporary, migrated.text.as_bytes())?;
    fs::rename(&temporary, file)?;
    Ok(migrated.not_carried_over)
}

#[cfg(test)]
#[path = "settings_tests.rs"]
mod tests;
