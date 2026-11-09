use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use crate::error::GitError;

/// The folders the user opened, the only places git may run (requirement
/// `opened-folders`).
///
/// It starts empty, so every folder is refused until the folder picker
/// (HAL-191) adds the folders the user chooses through [`Self::open`].
#[derive(Debug, Default)]
pub struct OpenedFolders {
    folders: Mutex<Vec<PathBuf>>,
}

impl OpenedFolders {
    /// A registry with no opened folders.
    pub fn new() -> Self {
        Self::default()
    }

    /// Records a folder the user opened. The folder is canonicalised now,
    /// so a later rename of a link in its path changes nothing.
    pub fn open(&self, folder: &Path) -> Result<(), GitError> {
        let folder = canonical(folder)?;
        let mut folders = self.folders.lock().unwrap_or_else(PoisonError::into_inner);
        if !folders.contains(&folder) {
            folders.push(folder);
        }
        Ok(())
    }

    /// Checks that `folder` is an opened folder or inside one, and returns
    /// its canonical form, which is where git then runs.
    ///
    /// Both sides go through the same canonicalisation, so `..`, links and,
    /// on Windows, the long-path prefix that canonicalising adds can't make
    /// the check wrong. The comparison is by path part, not by text: a
    /// folder `work-evil` is not inside a folder `work` next to it.
    pub fn check(&self, folder: &Path) -> Result<PathBuf, GitError> {
        let folder = canonical(folder)?;
        if self.contains_canonical(&folder) {
            return Ok(folder);
        }
        Err(GitError::FolderNotOpened)
    }

    /// Whether an already canonical path is inside an opened folder.
    pub(crate) fn contains_canonical(&self, folder: &Path) -> bool {
        let folders = self.folders.lock().unwrap_or_else(PoisonError::into_inner);
        folders.iter().any(|opened| folder.starts_with(opened))
    }
}

/// Canonicalises a path that must exist and be a folder.
pub(crate) fn canonical(folder: &Path) -> Result<PathBuf, GitError> {
    let canonical = std::fs::canonicalize(folder).map_err(|_| GitError::FolderUnreadable)?;
    if !canonical.is_dir() {
        return Err(GitError::FolderUnreadable);
    }
    Ok(canonical)
}
