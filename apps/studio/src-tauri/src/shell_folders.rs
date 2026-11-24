//! The workspace's folders in the profile that only the shell names for the
//! page: the review folder (HAL-1291) and the chats folder (HAL-17305). The
//! page names the folder (`folder: "review"` or `"chats"`), never its path.

use std::path::{Path, PathBuf};

use halonic_git_guard::OpenedFolders;
use halonic_profile::{ProfileFolder, WorkspaceFolders};

use super::{FileRefusal, Making, workspace_root};

/// The review folder of `workspace` in `profile`, as `reviewFolder` names
/// it. `workspace` must be a folder the person opened in the shell, or
/// inside one; its real path names the folder, as the CLI's `realpath` does.
pub(crate) fn review_root(
    opened: &OpenedFolders,
    profile: &ProfileFolder,
    workspace: &Path,
) -> Result<PathBuf, FileRefusal> {
    shell_root(opened, profile, workspace, WorkspaceFolders::review_folder)
}

/// The chats folder of `workspace` in `profile`, as `chatsFolder` names it,
/// checked as [`review_root`] checks the review folder.
pub(crate) fn chats_root(
    opened: &OpenedFolders,
    profile: &ProfileFolder,
    workspace: &Path,
) -> Result<PathBuf, FileRefusal> {
    shell_root(opened, profile, workspace, WorkspaceFolders::chats_folder)
}

/// The folder `pick` names among the profile folders of `workspace`, an
/// opened folder or one inside it.
fn shell_root(
    opened: &OpenedFolders,
    profile: &ProfileFolder,
    workspace: &Path,
    pick: fn(&WorkspaceFolders) -> String,
) -> Result<PathBuf, FileRefusal> {
    let real_path = workspace_root(opened, workspace)?;
    let real_path = real_path
        .to_str()
        .ok_or_else(|| FileRefusal::io("the workspace's path isn't valid Unicode"))?;
    let folders = profile
        .workspace_folders(real_path)
        .map_err(FileRefusal::io)?;
    Ok(PathBuf::from(pick(&folders)))
}

/// `root`, made first when `making` is a write's: a list or read of a folder
/// that isn't there leaves the profile as it was.
pub(crate) fn made_for(root: PathBuf, making: Making) -> Result<PathBuf, FileRefusal> {
    if making == Making::Folder {
        std::fs::create_dir_all(&root).map_err(FileRefusal::io)?;
    }
    Ok(root)
}
