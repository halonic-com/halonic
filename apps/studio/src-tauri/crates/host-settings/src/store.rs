use std::fs::{self, DirBuilder, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value};

use crate::error::HostSettingsError;
use crate::rename_over::rename_over;
use crate::saved::{change_saved_host_settings, is_host_setting_key, read_saved_host_settings};
use crate::unlinked::{ReadFailure, read_unlinked};

/// The one file that holds the settings, in the store's folder.
const SETTINGS_FILE: &str = "host.json";

/// Where a save over a file that can't be parsed keeps it first.
const BROKEN_FILE: &str = "host.json.broken";

/// The settings kept where Halonic runs, as one JSON file, `host.json`, in
/// a folder of the user's profile, `<profile>/settings`, laid out as
/// `FileHostSettingsStore` in `fs-node` lays it out (requirement
/// `host-settings-file`). The folder must never be inside a workspace.
///
/// A save reads the file, changes one key and writes a temporary file it
/// renames over the old one, so a reader sees the settings from before or
/// after, never half. The store doesn't take turns itself: the caller runs
/// saves one at a time (the shell holds one lock for every window), and
/// between processes the last save wins.
///
/// A file that isn't JSON, or doesn't have the shape, reads as none saved,
/// and the first save over it renames it to `host.json.broken` first. A
/// file that is a link, a hard link or not a plain file can't be read, so
/// `read` fails; a save replaces it.
#[derive(Debug, Clone)]
pub struct FileHostSettingsStore {
    root: PathBuf,
}

impl FileHostSettingsStore {
    /// A store over `root`, the settings folder, created on the first save.
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// Every saved value by key; empty when none is saved or the file can't
    /// be parsed. Reading creates nothing.
    ///
    /// # Errors
    ///
    /// `Unreadable` when the file is a link or can't be read.
    pub fn read(&self) -> Result<Map<String, Value>, HostSettingsError> {
        let file = self.file();
        let text = match read_unlinked(&file) {
            Ok(bytes) => bytes,
            Err(ReadFailure::Missing) => return Ok(Map::new()),
            Err(failure) => return Err(unreadable(&file, failure)),
        };
        Ok(read_saved_host_settings(&String::from_utf8_lossy(&text)).unwrap_or_default())
    }

    /// Saves one key's value and leaves every other key as it is.
    ///
    /// # Errors
    ///
    /// `InvalidKey` or `TooLarge`, saving nothing; `Unreadable` when the
    /// file can't be read for a reason other than being a link; `Io` when
    /// the write fails.
    pub fn set(&self, key: &str, value: &Value) -> Result<(), HostSettingsError> {
        self.save(key, Some(value))
    }

    /// Removes one key and leaves every other key as it is. Removing a key
    /// that isn't saved is not an error.
    ///
    /// # Errors
    ///
    /// As [`FileHostSettingsStore::set`].
    pub fn remove(&self, key: &str) -> Result<(), HostSettingsError> {
        self.save(key, None)
    }

    fn save(&self, key: &str, value: Option<&Value>) -> Result<(), HostSettingsError> {
        // The key first, so a refused one touches nothing.
        if !is_host_setting_key(key) {
            return Err(HostSettingsError::InvalidKey {
                key: key.to_owned(),
            });
        }
        let file = self.file();
        let old = match read_unlinked(&file) {
            Ok(bytes) => Some(String::from_utf8_lossy(&bytes).into_owned()),
            // A link or another entry the rename will replace.
            Err(ReadFailure::Missing | ReadFailure::Refused(_)) => None,
            Err(failure) => return Err(unreadable(&file, failure)),
        };
        let change = change_saved_host_settings(old.as_deref(), key, value)?;
        create_private_folder(&self.root)?;
        if change.broken {
            rename_over(&file, &self.root.join(BROKEN_FILE))?;
        }
        write_replacing(&file, &change.text)
    }

    fn file(&self) -> PathBuf {
        self.root.join(SETTINGS_FILE)
    }
}

fn unreadable(file: &Path, failure: ReadFailure) -> HostSettingsError {
    let reason = match failure {
        ReadFailure::Missing => "it isn't there".to_owned(),
        ReadFailure::Refused(reason) => reason.to_owned(),
        ReadFailure::Io(error) => error.to_string(),
    };
    HostSettingsError::Unreadable {
        file: file.to_owned(),
        reason,
    }
}

/// Creates the folder, and any missing parents, readable by its owner only.
/// A folder made earlier by something else is made private too, as
/// `makePrivateFolder` in `fs-node` does.
fn create_private_folder(folder: &Path) -> Result<(), HostSettingsError> {
    let mut builder = DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(folder)?;
    #[cfg(unix)]
    fs::set_permissions(
        folder,
        <fs::Permissions as std::os::unix::fs::PermissionsExt>::from_mode(0o700),
    )?;
    Ok(())
}

/// Writes `text` to a new temporary file next to `file`, then renames it
/// over `file`, replacing a link there rather than writing through it. On
/// Windows the rename is tried again while another program holds `file`.
fn write_replacing(file: &Path, text: &str) -> Result<(), HostSettingsError> {
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
    rename_over(temporary, file)
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
/// process id, a count within the process and the time, ending in `.tmp`
/// as `fs-node`'s do.
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
