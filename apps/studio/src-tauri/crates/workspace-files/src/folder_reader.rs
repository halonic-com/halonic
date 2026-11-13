//! Read-only access to every entry and byte of a folder, for the shell's
//! `folder_*` commands and the desktop `FolderReader` in
//! `packages/adapters/fs-tauri` built over them. It lists and reads as
//! `FileSystemFolderReader` in `fs-node` does, so a plugin's fingerprint is
//! the same on desktop and in the CLI.
//!
//! Unlike [`crate::WorkspaceFolder`] it hides nothing: `.git`, `.env` and
//! temporary write files are listed and read like any other. It refuses an
//! unsafe path, and never follows a link: a link is listed as one and
//! refused when a path goes through it. Only the shell's [`Fence`], the
//! profile, is left out, as for every call on a workspace.

use std::fs::{self, File, Metadata, OpenOptions};
use std::io::{self, Read};
use std::path::Path;

use crate::error::FileError;
use crate::fence::Fence;
use crate::links::{entry_at, is_missing, native_path};
use crate::workspace_path::check_workspace_path;

/// What an entry is, as `lstat` sees it. A link is a symbolic link or a
/// Windows junction, and is never a folder here.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    File,
    Folder,
    Link,
    /// A pipe, a socket, a device or anything else that isn't a file, a
    /// folder or a link.
    Other,
}

/// One entry under the folder: its path from the folder, "/" separated, its
/// kind and, for a file, its length in bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderEntry {
    pub path: String,
    pub kind: EntryKind,
    pub size: Option<u64>,
}

/// A folder the person opened, read without hiding or following anything.
#[derive(Debug)]
pub struct FolderReader {
    root: std::path::PathBuf,
    fence: Fence,
}

impl FolderReader {
    /// The folder at `root`, which the shell has already checked is an
    /// opened folder and made canonical.
    pub fn new(root: std::path::PathBuf) -> Self {
        Self {
            root,
            fence: Fence::Outside,
        }
    }

    /// The same folder, refusing every path in `fence` and leaving it out
    /// of lists.
    #[must_use]
    pub fn fenced(self, fence: Fence) -> Self {
        Self { fence, ..self }
    }

    /// Every entry under `dir` (the whole folder for `None`), links and
    /// special files included but never followed, relative to the folder and
    /// in UTF-16 code-unit order. Without `recursive` it lists only what is
    /// directly under `dir`. It stops once it found more than `limit`
    /// entries, so the answer then has `limit + 1`. A `dir` that isn't there
    /// or isn't a folder gives none; one that is a link, or goes through
    /// one, is refused.
    pub fn entries(
        &self,
        dir: Option<&str>,
        limit: Option<usize>,
        recursive: bool,
    ) -> Result<Vec<FolderEntry>, FileError> {
        let walk = Walk {
            fence: &self.fence,
            limit: limit.unwrap_or(usize::MAX),
            recursive,
        };
        let mut found = Vec::new();
        match dir {
            None => {
                self.fence.check("")?;
                walk.folder(&self.root, "", &mut found)?;
            }
            Some(dir) => {
                self.check(dir)?;
                if entry_at(&self.root, dir)?.is_some_and(|entry| entry.is_dir()) {
                    walk.folder(&native_path(&self.root, dir), dir, &mut found)?;
                }
            }
        }
        // UTF-16 code units, as JavaScript's `sort()` and the port's order have it.
        found.sort_by(|left, right| left.path.encode_utf16().cmp(right.path.encode_utf16()));
        Ok(found)
    }

    /// The file's bytes, or `None` when there is nothing at `path` or a
    /// folder. A special file is refused, and never opened.
    ///
    /// The open itself refuses to follow a link and, on Unix, doesn't wait
    /// (see [`open_unlinked`]), and the handle is then checked to be the file
    /// `lstat` saw. So a file swapped for a link, a folder or a pipe between
    /// the check and the open is refused rather than read, and can't hold a
    /// shell worker thread.
    pub fn read(&self, path: &str) -> Result<Option<Vec<u8>>, FileError> {
        self.check(path)?;
        let Some(seen) = entry_at(&self.root, path)? else {
            return Ok(None);
        };
        if seen.is_dir() {
            return Ok(None);
        }
        if !seen.is_file() {
            return Err(FileError::SpecialPath {
                path: path.to_owned(),
            });
        }
        let mut file = match open_unlinked(&native_path(&self.root, path)) {
            Ok(file) => file,
            Err(error) if is_missing(&error) => return Ok(None),
            Err(error) if is_link_refusal(&error) => return Err(changed(path)),
            Err(error) => return Err(FileError::io(path, &error)),
        };
        let opened = file
            .metadata()
            .map_err(|error| FileError::io(path, &error))?;
        if !opened.is_file() || !same_file(&seen, &opened) {
            return Err(changed(path));
        }
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|error| FileError::io(path, &error))?;
        Ok(Some(bytes))
    }

    /// The real location of the entry at `path`, with every link resolved:
    /// of the folder itself for `None`. `None` when nothing is at `path`. A
    /// link, or a path through one, is refused. A location that isn't
    /// Unicode is an error, since the page couldn't name it.
    pub fn location_of(&self, path: Option<&str>) -> Result<Option<String>, FileError> {
        let located = match path {
            None => {
                self.fence.check("")?;
                self.root.clone()
            }
            Some(path) => {
                self.check(path)?;
                if entry_at(&self.root, path)?.is_none() {
                    return Ok(None);
                }
                native_path(&self.root, path)
            }
        };
        match fs::canonicalize(&located) {
            Ok(real) => real
                .to_str()
                .map(|text| Some(text.to_owned()))
                .ok_or_else(|| FileError::Io {
                    message: "the location isn't valid Unicode".to_owned(),
                }),
            Err(error) if is_missing(&error) => Ok(None),
            Err(error) => Err(FileError::io(path.unwrap_or(""), &error)),
        }
    }

    /// Refuses an unsafe path, and one in the fence. A private name isn't
    /// refused: the reader hides nothing.
    fn check(&self, path: &str) -> Result<(), FileError> {
        check_workspace_path(path)?;
        self.fence.check(path)
    }
}

/// One listing's rules.
struct Walk<'a> {
    fence: &'a Fence,
    limit: usize,
    recursive: bool,
}

impl Walk<'_> {
    /// Adds every entry under `folder`, whose path from the root is `prefix`
    /// (`""` for the root), until there are more than the limit. A folder
    /// that is gone adds nothing; one the account may not read is
    /// `FolderUnreadable`, naming it. A name that isn't Unicode, or holds a
    /// backslash, can't be a path the page names, so listing it fails
    /// rather than leave it out of what is fingerprinted.
    fn folder(
        &self,
        folder: &Path,
        prefix: &str,
        found: &mut Vec<FolderEntry>,
    ) -> Result<(), FileError> {
        let entries = match fs::read_dir(folder) {
            Ok(entries) => entries,
            Err(error) if is_missing(&error) => return Ok(()),
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
                return Err(FileError::FolderUnreadable {
                    path: prefix.to_owned(),
                    message: error.to_string(),
                });
            }
            Err(error) => return Err(FileError::io(prefix, &error)),
        };
        for entry in entries {
            if found.len() > self.limit {
                return Ok(());
            }
            let entry = entry.map_err(|error| FileError::io(prefix, &error))?;
            let name = entry
                .file_name()
                .into_string()
                .ok()
                .filter(|name| !name.contains('\\'))
                .ok_or_else(|| FileError::Io {
                    message: format!("{prefix:?} holds a name that isn't a valid path."),
                })?;
            let path = if prefix.is_empty() {
                name
            } else {
                format!("{prefix}/{name}")
            };
            if self.fence.holds(&path) {
                continue;
            }
            // Gone since the listing began: it isn't in the folder any more.
            let Some(metadata) = metadata_or_gone(&entry, &path)? else {
                continue;
            };
            let kind = kind_of(&metadata);
            let size = (kind == EntryKind::File).then_some(metadata.len());
            let below = (kind == EntryKind::Folder && self.recursive).then(|| path.clone());
            found.push(FolderEntry { path, kind, size });
            if let Some(below) = below {
                self.folder(&entry.path(), &below, found)?;
            }
        }
        Ok(())
    }
}

fn changed(path: &str) -> FileError {
    FileError::Io {
        message: format!("{path:?} changed while it was opened: read it again."),
    }
}

/// Opens the file for reading without following a link, as `open_unlinked`
/// in `host-settings` does: `O_NOFOLLOW` and `O_NONBLOCK` on Unix, so a
/// link or a pipe swapped in after the check is refused instead of followed
/// or waited on; `FILE_FLAG_OPEN_REPARSE_POINT` on Windows, which opens a
/// link itself, so the handle then fails the plain-file check.
#[cfg(unix)]
fn open_unlinked(file: &Path) -> io::Result<File> {
    use std::os::unix::fs::OpenOptionsExt;
    OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(file)
}

#[cfg(windows)]
fn open_unlinked(file: &Path) -> io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    /// Opens a link itself rather than what it points to (`winbase.h`).
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(file)
}

/// The link `O_NOFOLLOW` wouldn't open (`ELOOP`, or `EMLINK` on FreeBSD).
#[cfg(unix)]
fn is_link_refusal(error: &io::Error) -> bool {
    matches!(error.raw_os_error(), Some(libc::ELOOP | libc::EMLINK))
}

#[cfg(not(unix))]
fn is_link_refusal(_: &io::Error) -> bool {
    false
}

/// What `lstat` says about the entry, or `None` when it is gone.
fn metadata_or_gone(entry: &fs::DirEntry, path: &str) -> Result<Option<Metadata>, FileError> {
    match fs::symlink_metadata(entry.path()) {
        Ok(metadata) => Ok(Some(metadata)),
        Err(error) if is_missing(&error) => Ok(None),
        Err(error) => Err(FileError::io(path, &error)),
    }
}

fn kind_of(metadata: &Metadata) -> EntryKind {
    let kind = metadata.file_type();
    if kind.is_symlink() {
        EntryKind::Link
    } else if kind.is_dir() {
        EntryKind::Folder
    } else if kind.is_file() {
        EntryKind::File
    } else {
        EntryKind::Other
    }
}

/// Whether two stats describe the same file: same device and inode. Windows
/// has no inode in them; there `lstat` refused links and the handle is
/// checked to be a file.
#[cfg(unix)]
fn same_file(first: &Metadata, second: &Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    first.dev() == second.dev() && first.ino() == second.ino()
}

#[cfg(not(unix))]
fn same_file(_: &Metadata, _: &Metadata) -> bool {
    true
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::process::Command;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("halonic-open-unlinked-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("a folder");
        dir
    }

    #[test]
    fn open_unlinked_refuses_a_link() {
        let dir = scratch("link");
        fs::write(dir.join("real"), "text").expect("a file");
        std::os::unix::fs::symlink(dir.join("real"), dir.join("link")).expect("a link");

        let error = open_unlinked(&dir.join("link")).expect_err("a link isn't followed");
        assert!(is_link_refusal(&error), "{error:?}");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn open_unlinked_does_not_wait_on_a_pipe() {
        let dir = scratch("pipe");
        let made = Command::new("mkfifo").arg(dir.join("pipe")).status();
        assert!(made.is_ok_and(|status| status.success()), "mkfifo");

        // A plain open would wait here for a writer, forever.
        let opened = open_unlinked(&dir.join("pipe")).expect("it opens without waiting");
        assert!(!opened.metadata().expect("metadata").is_file());
        let _ = fs::remove_dir_all(&dir);
    }
}
