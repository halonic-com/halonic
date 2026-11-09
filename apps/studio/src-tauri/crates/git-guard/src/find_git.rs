use std::path::PathBuf;

use crate::error::GitError;

/// Finds the git program on a PATH value, as an absolute path, so no shell
/// and no current folder ever decide which program runs. Relative entries
/// on the PATH are skipped.
pub fn find_git(path_variable: &std::ffi::OsStr) -> Result<PathBuf, GitError> {
    let program = if cfg!(windows) { "git.exe" } else { "git" };
    std::env::split_paths(path_variable)
        .filter(|folder| folder.is_absolute())
        .map(|folder| folder.join(program))
        .find(|candidate| candidate.is_file())
        .ok_or(GitError::GitNotFound)
}
