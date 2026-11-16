//! The `"discarded"` folder of the `fs_*` commands: `.studio/discarded` in an
//! opened workspace, where a discard keeps a copy of what it threw away. The
//! workspace's own store refuses `.studio` as private, so this folder is the
//! only way in, and only a write goes there.

use std::path::{Path, PathBuf};

use halonic_workspace_files::FileError;

use super::{FileFolder, FileRefusal, Making};

/// The folder a discard keeps its copies in, `.studio/discarded` under the
/// workspace's real path `root`. A link in either segment is refused, so a
/// copy can't land outside the workspace; only a write makes the folders.
pub(super) fn root(root: &Path, making: Making) -> Result<PathBuf, FileRefusal> {
    let mut folder = root.to_owned();
    for segment in [".studio", "discarded"] {
        folder.push(segment);
        match std::fs::symlink_metadata(&folder) {
            Ok(entry) if entry.file_type().is_symlink() => {
                return Err(FileError::LinkedPath {
                    path: format!(".studio/{segment}"),
                }
                .into());
            }
            Ok(entry) if entry.is_dir() => {}
            Ok(_) => return Err(FileRefusal::io(format!("{segment:?} is not a folder."))),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                if making != Making::Folder {
                    // Not there, and a read makes nothing: the path stands for the empty folder.
                    return Ok(root.join(".studio").join("discarded"));
                }
                std::fs::create_dir(&folder).map_err(FileRefusal::io)?;
            }
            Err(error) => return Err(FileRefusal::io(error)),
        }
    }
    Ok(folder)
}

/// Refuses every call but a write for the `"discarded"` folder.
pub(super) fn only_writes(folder: Option<FileFolder>) -> Result<(), FileRefusal> {
    if folder != Some(FileFolder::Discarded) {
        return Ok(());
    }
    Err(FileRefusal {
        kind: "private_path",
        message: "the discarded folder only takes writes".to_owned(),
        path: None,
    })
}
