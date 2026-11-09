//! Where a repository's files are, checked against the opened folders
//! (requirement `opened-folders`).
//!
//! A repository's top folder is not all of it. A `.git` file can point at a
//! git folder anywhere (`gitdir: /elsewhere/.git`), a `commondir` file at
//! another repository's objects and refs, and `objects/info/alternates` at
//! more objects. Each of them must be inside an opened folder too, or
//! `log -p`, `reset --hard` and `push` would work on another repository.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::error::GitError;
use crate::opened_folders::{OpenedFolders, canonical};

/// git reads alternates five deep; so does the check.
const MAX_ALTERNATE_DEPTH: usize = 5;

/// The checked folders of a repository, all canonical and inside an opened
/// folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Repository {
    pub top: PathBuf,
    pub git_dir: PathBuf,
    pub common_dir: PathBuf,
}

/// The arguments that ask git where the repository's folders are.
pub(crate) const LOCATE_ARGS: &[&str] = &[
    "rev-parse",
    "--path-format=absolute",
    "--show-toplevel",
    "--git-dir",
    "--git-common-dir",
];

/// Reads the answer to [`LOCATE_ARGS`] and checks every folder in it, and
/// the alternates, against the opened folders.
pub(crate) fn check_located(
    folders: &OpenedFolders,
    stdout: &[u8],
) -> Result<Repository, GitError> {
    // git ends each path with a newline, and on Windows writes it with `/`.
    let mut lines = stdout
        .split(|byte| *byte == b'\n')
        .map(|line| line.strip_suffix(b"\r").unwrap_or(line));
    let mut next_folder = || -> Result<PathBuf, GitError> {
        let line = lines.next().ok_or(GitError::FolderUnreadable)?;
        let path = path_from_git(line)?;
        // Asked for absolute paths, git gives nothing else; anything else
        // would be read against the shell's own folder.
        if !path.is_absolute() {
            return Err(GitError::FolderUnreadable);
        }
        let folder = canonical(&path)?;
        if !folders.contains_canonical(&folder) {
            return Err(GitError::FolderNotOpened);
        }
        Ok(folder)
    };
    let repository = Repository {
        top: next_folder()?,
        git_dir: next_folder()?,
        common_dir: next_folder()?,
    };
    check_alternates(folders, &repository.common_dir.join("objects"), 0)?;
    Ok(repository)
}

/// Checks every folder an `objects/info/alternates` file names, and theirs
/// in turn. Relative entries are relative to the objects folder.
fn check_alternates(folders: &OpenedFolders, objects: &Path, depth: usize) -> Result<(), GitError> {
    let file = objects.join("info").join("alternates");
    let contents = match std::fs::read(&file) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(GitError::FolderUnreadable),
    };
    for line in contents.split(|byte| *byte == b'\n') {
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        if line.is_empty() || line.starts_with(b"#") {
            continue;
        }
        // Past git's depth an alternate is ignored by git, but it is still
        // refused here: nothing outside the opened folders is read.
        let alternate = canonical(&objects.join(path_from_git(line)?))?;
        if !folders.contains_canonical(&alternate) {
            return Err(GitError::FolderNotOpened);
        }
        if depth < MAX_ALTERNATE_DEPTH {
            check_alternates(folders, &alternate, depth + 1)?;
        }
    }
    Ok(())
}

/// A path as git wrote it: raw bytes on Unix, where a file name need not be
/// UTF-8, and UTF-8 on Windows.
pub(crate) fn path_from_git(bytes: &[u8]) -> Result<PathBuf, GitError> {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStringExt;
        Ok(PathBuf::from(OsString::from_vec(bytes.to_vec())))
    }
    #[cfg(not(unix))]
    {
        String::from_utf8(bytes.to_vec())
            .map(|text| PathBuf::from(OsString::from(text)))
            .map_err(|_| GitError::FolderUnreadable)
    }
}
