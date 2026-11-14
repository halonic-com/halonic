//! The `"tool-approvals"` folder of the `fs_*` commands (HAL-8868): one
//! source's approvals of listed tools in one opened workspace, which
//! `TauriToolApprovalStore` in `packages/adapters/fs-tauri` keeps through
//! the shell in the same files as the CLI's `FileToolApprovalStore`.
//!
//! The page names a workspace it opened and a source, never a path: the
//! shell works out `<profile>/tool-approvals/<hash of [location, source]>`
//! itself, as `FileToolApprovalStore` does, so the page can reach no other
//! workspace's approvals. Only the store's own file names work in it, so the
//! page can't touch the lock file. Writes and removes hold the folder's
//! `lock` file, as the CLI does, and write files private to the user.

use std::fs::DirBuilder;
use std::path::{Path, PathBuf};

use halonic_git_guard::OpenedFolders;
use halonic_profile::ProfileFolder;
use halonic_workspace_files::{FileError, WorkspaceFolder};

use super::{FileFolder, FileRefusal, Making, workspace_root};
use crate::runs::OperatingSystem;

/// The lock file in a source's folder, taken for every write and remove.
const LOCK_FILE: &str = "lock";

/// The folder of `source`'s approvals in `workspace`, which must be a folder
/// the person opened in the shell, or inside one. Nothing is created. A
/// folder inside the workspace is refused, so a workspace can't arrive with
/// its tools already approved.
pub(super) fn source_root(
    opened: &OpenedFolders,
    profile: &ProfileFolder,
    workspace: &Path,
    source: Option<&str>,
) -> Result<PathBuf, FileRefusal> {
    let source = source.ok_or_else(|| unsafe_path("the tool approvals need a source"))?;
    let real_path = workspace_root(opened, workspace)?;
    let location = real_path
        .to_str()
        .ok_or_else(|| FileRefusal::io("the workspace's path isn't valid Unicode"))?;
    let root = PathBuf::from(profile.tool_approval_source_folder(location, source));
    if real_path_as_far_as_it_exists(&root)?.starts_with(&real_path) {
        return Err(FileRefusal {
            kind: "private_path",
            message: format!(
                "the tool approvals folder is inside the workspace {}",
                workspace.display()
            ),
            path: None,
        });
    }
    Ok(root)
}

/// Refuses a file name the page may not use in the approvals folder: only
/// the store's own, an approval's SHA-256 and `.json`, or `waiting.json`.
pub(super) fn check_file(folder: Option<FileFolder>, path: &str) -> Result<(), FileRefusal> {
    if folder != Some(FileFolder::ToolApprovals) || is_store_file(path) {
        return Ok(());
    }
    Err(only_the_stores_files())
}

/// Refuses a list of anything but the whole approvals folder.
pub(super) fn check_list(folder: Option<FileFolder>, dir: Option<&str>) -> Result<(), FileRefusal> {
    if folder != Some(FileFolder::ToolApprovals) || dir.is_none() {
        return Ok(());
    }
    Err(only_the_stores_files())
}

fn unsafe_path(message: &str) -> FileRefusal {
    FileRefusal {
        kind: "unsafe_path",
        message: message.to_owned(),
        path: None,
    }
}

fn only_the_stores_files() -> FileRefusal {
    unsafe_path("the tool approvals folder holds only the store's own files")
}

/// Runs `call` on the source's folder: a write makes the folder private to
/// the user first, and a write or a remove holds the folder's lock.
pub(super) fn run<T>(
    root: &Path,
    making: Making,
    files: WorkspaceFolder<'_>,
    call: impl FnOnce(WorkspaceFolder<'_>) -> Result<T, FileError>,
) -> Result<T, FileRefusal> {
    match making {
        Making::Nothing => Ok(call(files)?),
        Making::Folder => {
            make_private_folder(root)?;
            locked(root, files, call)
        }
        // A source with no folder has nothing to remove, and no lock to hold.
        Making::Removing if !root.is_dir() => Ok(call(files)?),
        Making::Removing => locked(root, files, call),
    }
}

/// Runs `call` while holding the folder's lock file, which must exist.
fn locked<T>(
    root: &Path,
    files: WorkspaceFolder<'_>,
    call: impl FnOnce(WorkspaceFolder<'_>) -> Result<T, FileError>,
) -> Result<T, FileRefusal> {
    let answer =
        halonic_run_lock::with_run_lock(&root.join(LOCK_FILE), &OperatingSystem, || call(files))
            .map_err(FileRefusal::io)?;
    Ok(answer?)
}

/// Makes the folder, and the ones above it that are missing, private to the
/// user (`700` on systems with modes), as the store in `fs-node` does.
fn make_private_folder(root: &Path) -> Result<(), FileRefusal> {
    let mut builder = DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(root).map_err(FileRefusal::io)
}

/// Whether `name` is a file the store keeps: an approval, a SHA-256 in
/// lower-case hex and `.json`, or the waiting versions.
fn is_store_file(name: &str) -> bool {
    let hash = name.strip_suffix(".json").unwrap_or_default();
    name == "waiting.json"
        || (hash.len() == 64
            && hash
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)))
}

/// The real path of `path`, or of its nearest folder that exists with the
/// rest joined on: the approvals folder may not exist yet, and a link in
/// the way must not hide it.
fn real_path_as_far_as_it_exists(path: &Path) -> Result<PathBuf, FileRefusal> {
    let mut missing = Vec::new();
    let mut current = path;
    loop {
        match current.canonicalize() {
            Ok(mut real) => {
                real.extend(missing.iter().rev());
                return Ok(real);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let (Some(parent), Some(name)) = (current.parent(), current.file_name()) else {
                    return Err(FileRefusal::io(error));
                };
                missing.push(name);
                current = parent;
            }
            Err(error) => return Err(FileRefusal::io(error)),
        }
    }
}

#[cfg(test)]
#[path = "tool_approvals_tests.rs"]
mod tests;
