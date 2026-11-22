//! How much of a workspace the shell reads at most. The folder can be
//! anyone's, so a file of any size or a chain of folders of any depth must
//! end in a refusal, not fill the shell's memory or a worker thread's stack.

use std::fs::File;
use std::io::Read;

use crate::error::FileError;

/// The most bytes one read gives the page: 64 MiB, far more than a
/// definition or a plugin's file holds.
pub const MAX_READ_BYTES: u64 = 64 * 1024 * 1024;

/// How many folders deep a list steps, counted from the workspace: well
/// past any project's tree, and few enough that the walk's open folders and
/// its stack stay small on every system.
pub const MAX_FOLDER_DEPTH: usize = 100;

/// The open file's bytes. One larger than [`MAX_READ_BYTES`] is refused
/// before anything is read, and so is one that grew past it meanwhile.
pub(crate) fn read_at_most(file: &mut File, path: &str) -> Result<Vec<u8>, FileError> {
    let too_large = || FileError::Io {
        message: format!(
            "{path:?} is larger than {} MB, more than Halonic reads.",
            MAX_READ_BYTES / (1024 * 1024)
        ),
    };
    let size = file
        .metadata()
        .map_err(|error| FileError::io(path, &error))?
        .len();
    if size > MAX_READ_BYTES {
        return Err(too_large());
    }
    let mut bytes = Vec::new();
    file.by_ref()
        .take(MAX_READ_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| FileError::io(path, &error))?;
    if bytes.len() as u64 > MAX_READ_BYTES {
        return Err(too_large());
    }
    Ok(bytes)
}

/// Refuses to step into the folder at the workspace path `prefix` (`""` for
/// the workspace) when it is more than [`MAX_FOLDER_DEPTH`] folders deep.
pub(crate) fn check_depth(prefix: &str) -> Result<(), FileError> {
    let depth = if prefix.is_empty() {
        0
    } else {
        prefix.split('/').count()
    };
    if depth > MAX_FOLDER_DEPTH {
        return Err(FileError::Io {
            message: format!(
                "{prefix:?} is more than {MAX_FOLDER_DEPTH} folders deep, deeper than Halonic reads."
            ),
        });
    }
    Ok(())
}
