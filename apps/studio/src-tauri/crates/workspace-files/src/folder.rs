use std::fs::{self, DirEntry, Metadata, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::error::FileError;
use crate::fence::Fence;
use crate::links::{entry_at, is_missing, native_path};
use crate::temporary_write::{is_temporary_write, temporary_write_name};
use crate::workspace_path::{check_public_workspace_path, is_private_workspace_path};
use crate::write_locks::WriteLocks;

/// What [`WorkspaceFolder::write`] did: `{ status: "written" }`, or
/// `{ status: "changed-on-disk", current }` when the file no longer held
/// what the caller expected, with its text now (`None` when it is gone).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WriteOutcome {
    Written,
    ChangedOnDisk { current: Option<String> },
}

/// A folder the person opened, as `FolderDefinitionStore` in `fs-node`
/// keeps it: plain files under the root, never through a link, and never
/// in its [`Fence`].
#[derive(Debug)]
pub struct WorkspaceFolder<'a> {
    root: PathBuf,
    locks: &'a WriteLocks,
    fence: Fence,
}

impl<'a> WorkspaceFolder<'a> {
    /// The files under `root`, which the shell has already checked is an
    /// opened folder and made canonical. Writes and removes take turns
    /// through `locks`, which every call on the folder must share.
    pub fn new(root: PathBuf, locks: &'a WriteLocks) -> Self {
        Self {
            root,
            locks,
            fence: Fence::Outside,
        }
    }

    /// The same folder, refusing every path in `fence` as private and
    /// leaving it out of lists.
    #[must_use]
    pub fn fenced(self, fence: Fence) -> Self {
        Self { fence, ..self }
    }

    /// Every file under `dir` (the whole folder for `None`), recursively,
    /// relative to the root and sorted as JavaScript sorts strings. A `dir`
    /// that isn't a folder gives none. Private entries, links and temporary
    /// write files are left out, with everything under them, and so is the
    /// fence.
    pub fn list(&self, dir: Option<&str>) -> Result<Vec<String>, FileError> {
        let mut paths = Vec::new();
        let mut add = |path: String, _: &DirEntry| {
            paths.push(path);
            Ok::<(), FileError>(())
        };
        match dir {
            None => {
                self.fence.check("")?;
                walk(&self.root, "", &self.fence, &mut add)?;
            }
            Some(dir) => {
                self.check(dir)?;
                if entry_at(&self.root, dir)?.is_some_and(|entry| entry.is_dir()) {
                    walk(&native_path(&self.root, dir), dir, &self.fence, &mut add)?;
                }
            }
        }
        sort_as_javascript(&mut paths);
        Ok(paths)
    }

    /// The file's text, or `None` when there is no file at `path`.
    pub fn read(&self, path: &str) -> Result<Option<String>, FileError> {
        self.check(path)?;
        self.current_text(path)
    }

    /// Creates or replaces the file, creating folders as needed. With
    /// `expected` (`"absent"` or a [`content_digest`]), it first checks the
    /// file still holds that and, if not, writes nothing. The check and the
    /// write happen in one turn on the file (see [`WriteLocks`]).
    ///
    /// The text goes to a temporary file in the same folder, flushed to
    /// disk, which is then renamed over the file, so another program reads
    /// the old text or the new, never half of it.
    pub fn write(
        &self,
        path: &str,
        text: &str,
        expected: Option<&str>,
    ) -> Result<WriteOutcome, FileError> {
        self.check(path)?;
        let _turn = self.locks.turn(&native_path(&self.root, path));
        if let Some(expected) = expected {
            let current = self.current_text(path)?;
            if !matches_expected(current.as_deref(), expected) {
                return Ok(WriteOutcome::ChangedOnDisk { current });
            }
        }
        self.replace(path, text)?;
        Ok(WriteOutcome::Written)
    }

    /// Deletes the file. Nothing at `path`, or a folder there, is not an
    /// error, as in `fs-node`.
    pub fn remove(&self, path: &str) -> Result<(), FileError> {
        self.check(path)?;
        let file = native_path(&self.root, path);
        let _turn = self.locks.turn(&file);
        if !entry_at(&self.root, path)?.is_some_and(|entry| entry.is_file()) {
            return Ok(());
        }
        match fs::remove_file(&file) {
            Err(error) if !is_missing(&error) => Err(FileError::io(path, &error)),
            // Another program removed it in the meantime: it is gone, as asked.
            _ => Ok(()),
        }
    }

    /// Refuses an unsafe or private path, and one in the fence.
    fn check(&self, path: &str) -> Result<(), FileError> {
        check_public_workspace_path(path)?;
        self.fence.check(path)
    }

    /// The text at a checked path, or `None` when no file is there.
    fn current_text(&self, path: &str) -> Result<Option<String>, FileError> {
        if !entry_at(&self.root, path)?.is_some_and(|entry| entry.is_file()) {
            return Ok(None);
        }
        let bytes = match fs::read(native_path(&self.root, path)) {
            Ok(bytes) => bytes,
            Err(error) if is_missing(&error) => return Ok(None),
            Err(error) => return Err(FileError::io(path, &error)),
        };
        String::from_utf8(bytes)
            .map(Some)
            .map_err(|_| FileError::NotText {
                path: path.to_owned(),
            })
    }

    /// Writes `text` to a temporary file next to `path`, flushed to disk,
    /// and renames it over the file.
    fn replace(&self, path: &str, text: &str) -> Result<(), FileError> {
        // Checks the folders on the way and the file itself, so the write
        // can't land behind a link.
        let existing = entry_at(&self.root, path)?;
        if existing.as_ref().is_some_and(Metadata::is_dir) {
            return Err(FileError::Io {
                message: format!("{path:?} is a folder."),
            });
        }
        let folder = self.create_folders(path)?;
        let temporary = folder.join(temporary_write_name());
        let written = write_flushed(&temporary, text, existing.as_ref())
            .and_then(|()| fs::rename(&temporary, native_path(&self.root, path)));
        if let Err(error) = written {
            // The write's own error is the one to report; a temporary file
            // that can't be removed either is left out of every list.
            let _ = fs::remove_file(&temporary);
            return Err(FileError::io(path, &error));
        }
        Ok(())
    }

    /// Creates the folders `path` needs, one segment at a time, refusing a
    /// link or a file in the way. Returns the file's folder.
    fn create_folders(&self, path: &str) -> Result<PathBuf, FileError> {
        let mut folder = self.root.clone();
        let Some((parents, _)) = path.rsplit_once('/') else {
            return Ok(folder);
        };
        let in_the_way = || FileError::Io {
            message: format!("{path:?}: a file is in the way of its folder."),
        };
        for segment in parents.split('/') {
            folder.push(segment);
            // Each segment is looked at before anything is created in it,
            // so no folder is ever made behind a link.
            match fs::symlink_metadata(&folder) {
                Ok(entry) if entry.file_type().is_symlink() => {
                    return Err(FileError::LinkedPath {
                        path: path.to_owned(),
                    });
                }
                Ok(entry) if entry.is_dir() => {}
                Ok(_) => return Err(in_the_way()),
                Err(error) if is_missing(&error) => {
                    if let Err(error) = fs::create_dir(&folder)
                        && error.kind() != io::ErrorKind::AlreadyExists
                    {
                        return Err(FileError::io(path, &error));
                    }
                }
                Err(error) => return Err(FileError::io(path, &error)),
            }
        }
        // Looked at again once they all exist, so a folder another program
        // swapped for a link meanwhile is still refused.
        match entry_at(&self.root, parents)? {
            Some(entry) if entry.is_dir() => Ok(folder),
            _ => Err(in_the_way()),
        }
    }
}

/// `sha256:` and the 64 lower-case hex characters of the SHA-256 of the
/// text's UTF-8 bytes: the digest `expected` names, as `contentDigest` in
/// `@halonicjs/std` works it out.
pub fn content_digest(text: &str) -> String {
    let digest = Sha256::digest(text.as_bytes());
    let hex: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
    format!("sha256:{hex}")
}

/// Whether the file's text is what the caller expected, as
/// `matchesExpected` in `@halonicjs/std` decides it.
fn matches_expected(current: Option<&str>, expected: &str) -> bool {
    match current {
        None => expected == "absent",
        Some(text) => expected != "absent" && content_digest(text) == expected,
    }
}

/// Creates `file`, which must not exist yet, with `text`, flushed to disk.
/// A replaced file's permissions carry over, such as a script's execute bit.
fn write_flushed(file: &Path, text: &str, replaced: Option<&Metadata>) -> io::Result<()> {
    let mut created = OpenOptions::new().write(true).create_new(true).open(file)?;
    created.write_all(text.as_bytes())?;
    created.sync_all()?;
    #[cfg(unix)]
    if let Some(replaced) = replaced {
        created.set_permissions(replaced.permissions())?;
    }
    #[cfg(not(unix))]
    let _ = replaced;
    Ok(())
}

/// Calls `visit` with the workspace path and entry of every file under
/// `folder`, whose workspace path is `prefix`, as `#collect` in `fs-node`
/// walks it, leaving out `fence`. A folder that is gone gives nothing; one
/// the account may not read is `FolderUnreadable`, naming it (`""` for the
/// root).
pub(crate) fn walk(
    folder: &Path,
    prefix: &str,
    fence: &Fence,
    visit: &mut dyn FnMut(String, &DirEntry) -> Result<(), FileError>,
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
        let entry = entry.map_err(|error| FileError::io(prefix, &error))?;
        // A name that isn't Unicode, or has a backslash (Linux allows one),
        // can't be a workspace path.
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if name.contains('\\') || is_temporary_write(&name) || is_private_workspace_path(&name) {
            continue;
        }
        let kind = entry
            .file_type()
            .map_err(|error| FileError::io(prefix, &error))?;
        let path = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        if kind.is_symlink() || fence.holds(&path) {
            continue;
        } else if kind.is_dir() {
            walk(&entry.path(), &path, fence, visit)?;
        } else if kind.is_file() {
            visit(path, &entry)?;
        }
    }
    Ok(())
}

/// Sorts as JavaScript's `sort()` does: by UTF-16 code units, which puts
/// a character above U+FFFF before U+E000 to U+FFFF, unlike Rust's order.
pub(crate) fn sort_as_javascript(paths: &mut [String]) {
    paths.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
}
