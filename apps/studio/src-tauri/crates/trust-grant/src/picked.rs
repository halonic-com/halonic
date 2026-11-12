use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::refusal::TrustRefusal;

/// How many picked folders the shell remembers, the same as the Studio's
/// Recent on this device, so the file can't grow without end.
pub const MAX_PICKED_FOLDERS: usize = 9;

/// The file's format. A file with another version is read as an empty list.
const FORMAT_VERSION: u32 = 1;

/// One write to the list at a time in this process: each write reads the
/// list, changes it and replaces the file, and two at once would lose one.
static WRITING: Mutex<()> = Mutex::new(());

/// The folders the person picked in the folder dialog, kept in the profile
/// so the shell can open them again after a restart (HAL-6637). Only the
/// shell adds to it, after a pick; the page can only reopen or forget an
/// entry. Most recently picked or reopened first.
///
/// The list fails closed: a file that is missing, can't be read or isn't
/// the format below is an empty list, so nothing opens that the person
/// didn't pick.
#[derive(Debug, Clone)]
pub struct PickedFolders {
    file: PathBuf,
}

/// A picked folder as the file keeps it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct PickedFolder {
    /// The canonical path in plain form, as `pick` answered it.
    pub location: String,
    /// Which folder was at that path when it was picked, where the system
    /// can tell cheaply, so a folder deleted and made again at the same path
    /// isn't taken for the one the person picked.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity: Option<FolderIdentity>,
}

/// A folder's device and inode on Unix, where every entry must have one.
/// Windows has no stable call for its file ID in the standard library yet,
/// so a Windows entry has none (follow-up on HAL-6637).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct FolderIdentity {
    pub device: u64,
    pub inode: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct ListFile {
    version: u32,
    folders: Vec<PickedFolder>,
}

impl PickedFolders {
    /// The list kept in `file`. Nothing is read or created yet.
    pub fn new(file: impl Into<PathBuf>) -> Self {
        Self { file: file.into() }
    }

    /// The remembered locations, most recently picked or reopened first.
    pub fn locations(&self) -> Vec<String> {
        self.read()
            .into_iter()
            .map(|folder| folder.location)
            .collect()
    }

    /// The entry for exactly `location`, if the person picked it.
    pub(crate) fn find(&self, location: &str) -> Option<PickedFolder> {
        self.read()
            .into_iter()
            .find(|folder| folder.location == location)
    }

    /// Puts `folder` first, dropping an older entry for the same location
    /// and the oldest entries past [`MAX_PICKED_FOLDERS`].
    pub(crate) fn remember(&self, folder: PickedFolder) -> Result<(), TrustRefusal> {
        let _writing = WRITING.lock().unwrap_or_else(PoisonError::into_inner);
        let mut folders = self.read();
        folders.retain(|kept| kept.location != folder.location);
        folders.insert(0, folder);
        folders.truncate(MAX_PICKED_FOLDERS);
        self.write(folders)
    }

    /// Drops the entry for `location`. No error, and no write, when there
    /// is none.
    pub fn forget(&self, location: &str) -> Result<(), TrustRefusal> {
        let _writing = WRITING.lock().unwrap_or_else(PoisonError::into_inner);
        let mut folders = self.read();
        let before = folders.len();
        folders.retain(|kept| kept.location != location);
        if folders.len() == before {
            return Ok(());
        }
        self.write(folders)
    }

    /// The list, or an empty one when the file is missing or can't be
    /// trusted. Why it can't goes to the log.
    fn read(&self) -> Vec<PickedFolder> {
        let text = match fs::read_to_string(&self.file) {
            Ok(text) => text,
            Err(error) if error.kind() == ErrorKind::NotFound => return Vec::new(),
            Err(error) => {
                eprintln!(
                    "picked folders: {} can't be read, so none are remembered: {error}",
                    self.file.display()
                );
                return Vec::new();
            }
        };
        match serde_json::from_str::<ListFile>(&text) {
            Ok(list) if list.version == FORMAT_VERSION => {
                // The shell never writes more; a longer list is read capped
                // too, so a written file can't make `find` search without end.
                let mut folders = list.folders;
                folders.truncate(MAX_PICKED_FOLDERS);
                folders
            }
            Ok(list) => {
                eprintln!(
                    "picked folders: {} has version {}, not {FORMAT_VERSION}, so none are remembered",
                    self.file.display(),
                    list.version
                );
                Vec::new()
            }
            Err(error) => {
                eprintln!(
                    "picked folders: {} is damaged, so none are remembered: {error}",
                    self.file.display()
                );
                Vec::new()
            }
        }
    }

    /// Replaces the file: a temporary file next to it, then a rename, so a
    /// crash leaves the old list or the new one, never half of one.
    fn write(&self, folders: Vec<PickedFolder>) -> Result<(), TrustRefusal> {
        let list = ListFile {
            version: FORMAT_VERSION,
            folders,
        };
        let mut text = serde_json::to_string_pretty(&list).map_err(TrustRefusal::io)?;
        text.push('\n');
        if let Some(parent) = self.file.parent() {
            fs::create_dir_all(parent).map_err(TrustRefusal::io)?;
        }
        let temporary = temporary_for(&self.file);
        if let Err(error) = write_then_rename(&temporary, &self.file, &text) {
            // A half-written temporary file must not stay behind. If removing
            // it fails too, the write's own error is the one to report.
            let _ = fs::remove_file(&temporary);
            return Err(TrustRefusal::io(error));
        }
        Ok(())
    }
}

/// The identity of the folder at `canonical`, where the system gives one.
pub(crate) fn folder_identity(canonical: &Path) -> Option<FolderIdentity> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let metadata = fs::metadata(canonical).ok()?;
        Some(FolderIdentity {
            device: metadata.dev(),
            inode: metadata.ino(),
        })
    }
    #[cfg(not(unix))]
    {
        let _ = canonical;
        None
    }
}

fn write_then_rename(temporary: &Path, file: &Path, text: &str) -> std::io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut opened = options.open(temporary)?;
    opened.write_all(text.as_bytes())?;
    opened.sync_all()?;
    drop(opened);
    fs::rename(temporary, file)
}

/// A temporary file name next to `file` that no other write uses: the
/// process id, a count within the process and the time.
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
