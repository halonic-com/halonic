//! Links inside a repository's git folder, checked against the opened
//! folders (requirement `opened-folders`).
//!
//! git follows a link anywhere in its folder. With `objects`, a pack file
//! or a loose object folder linked to another repository, and `refs` or
//! `packed-refs` linked too, `log -p` shows that repository and `push`
//! sends it out. With a folder in `logs` linked, `branch` and `commit`
//! write that repository's reflogs, and `@{n}` reads them. So every link at
//! the top of the git folder and the common folder, and every link anywhere
//! under `objects`, `refs` and `logs`, must lead inside an opened folder.
//! Links are followed, not refused: tools such as `repo` and
//! `git-new-workdir` link these folders on purpose.
//!
//! Measured on a git folder with 6,700 loose objects, 150 pack files and
//! 50,000 loose refs, the walk takes about 30 ms on a local disk, less than
//! starting git once. Hooks and nested repositories are not walked: hooks
//! never run, and a nested repository is checked on its own.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::error::GitError;
use crate::opened_folders::OpenedFolders;

/// The folders, inside a git folder, walked to the bottom.
const WALKED: &[&str] = &["objects", "refs", "logs"];

/// How many entries are read between two looks at the time limit.
const ENTRIES_PER_DEADLINE_CHECK: usize = 256;

/// One walk over a repository's git folders. It remembers the folders it
/// reached through a link, so a link loop ends.
pub(crate) struct Links<'a> {
    folders: &'a OpenedFolders,
    deadline: Instant,
    linked: HashSet<PathBuf>,
    entries: usize,
}

impl<'a> Links<'a> {
    pub fn new(folders: &'a OpenedFolders, deadline: Instant) -> Self {
        Self {
            folders,
            deadline,
            linked: HashSet::new(),
            entries: 0,
        }
    }

    /// Checks the links at the top of a git folder, and under its
    /// `objects`, `refs` and `logs`. A git folder of a linked worktree has
    /// no `objects`, and may have no `refs` or `logs`.
    pub fn check_git_folder(&mut self, git_folder: &Path) -> Result<(), GitError> {
        self.check_folder(git_folder, false)?;
        for name in WALKED {
            let folder = git_folder.join(name);
            match std::fs::symlink_metadata(&folder) {
                Ok(_) => self.check_folder(&folder, true)?,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err(GitError::FolderUnreadable),
            }
        }
        Ok(())
    }

    /// Checks every link under a canonical folder, such as an alternate
    /// objects folder, once.
    pub fn check_canonical_folder(&mut self, folder: PathBuf) -> Result<(), GitError> {
        if !self.linked.insert(folder.clone()) {
            return Ok(());
        }
        self.check_folder(&folder, true)
    }

    /// Checks the links in a folder and, when `deep`, in its subfolders and
    /// in the folders its links lead to.
    fn check_folder(&mut self, folder: &Path, deep: bool) -> Result<(), GitError> {
        let entries = std::fs::read_dir(folder).map_err(|_| GitError::FolderUnreadable)?;
        for entry in entries {
            self.entries += 1;
            if self.entries.is_multiple_of(ENTRIES_PER_DEADLINE_CHECK)
                && Instant::now() >= self.deadline
            {
                return Err(GitError::TimedOut);
            }
            let entry = entry.map_err(|_| GitError::FolderUnreadable)?;
            // Read from the folder listing: no extra call per entry. On
            // Windows a junction counts as a link too.
            let kind = entry.file_type().map_err(|_| GitError::FolderUnreadable)?;
            if kind.is_symlink() {
                // A link that leads nowhere is refused too: git could
                // create what it names, outside.
                let target =
                    std::fs::canonicalize(entry.path()).map_err(|_| GitError::FolderUnreadable)?;
                if !self.folders.contains_canonical(&target) {
                    return Err(GitError::FolderNotOpened);
                }
                if deep && target.is_dir() {
                    self.check_canonical_folder(target)?;
                }
            } else if deep && kind.is_dir() {
                self.check_folder(&entry.path(), true)?;
            }
        }
        Ok(())
    }
}

#[cfg(all(test, unix))]
#[path = "git_folder_links_tests.rs"]
mod tests;
