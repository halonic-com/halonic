//! Walking a workspace path segment by segment without following a link, as
//! `entryAt` in `fs-node` does.

use std::fs::{self, Metadata};
use std::io;
use std::path::{Path, PathBuf};

use crate::error::FileError;

/// What is at the safe workspace path `path` under `root`, read without
/// following links: `None` when nothing is there, or a file sits where a
/// folder should be.
///
/// Every segment is looked at on its own, so a symbolic link in any of them
/// is refused. On Windows, Rust counts a junction as a link too (a reparse
/// point whose tag is a name surrogate); other reparse points, such as a
/// OneDrive file that isn't downloaded yet, are plain files and folders.
pub(crate) fn entry_at(root: &Path, path: &str) -> Result<Option<Metadata>, FileError> {
    let mut current = root.to_path_buf();
    let mut found = None;
    for segment in path.split('/') {
        current.push(segment);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(FileError::LinkedPath {
                    path: path.to_owned(),
                });
            }
            Ok(metadata) => found = Some(metadata),
            Err(error) if is_missing(&error) => return Ok(None),
            Err(error) => return Err(FileError::io(path, &error)),
        }
    }
    Ok(found)
}

/// The file or folder at the workspace path `path` under `root`, joined one
/// segment at a time: a Windows root in the long-path form `\\?\` takes no
/// `/` as a separator.
pub(crate) fn native_path(root: &Path, path: &str) -> PathBuf {
    let mut native = root.to_path_buf();
    native.extend(path.split('/'));
    native
}

/// Whether an error means "there is nothing at this path", as `isMissing`
/// in `fs-node` reads `ENOENT` and `ENOTDIR`.
pub(crate) fn is_missing(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::NotFound | io::ErrorKind::NotADirectory
    )
}
