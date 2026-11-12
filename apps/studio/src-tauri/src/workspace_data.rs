//! What the `blob_*` and `record_*` commands share (HAL-6175): the shape of
//! their refusals, and the folders in the profile of a workspace the person
//! opened in the shell, as `workspaceFolders` in `@halonicjs/profile` names
//! them, so the shell and the CLI keep one workspace's blobs and records in
//! the same files. No command takes a path for its store: the page names a
//! workspace it opened, and the shell works out the folder itself.

use std::fmt::Display;
use std::path::{Path, PathBuf};

use halonic_git_guard::OpenedFolders;
use halonic_profile::{ProfileFolder, WorkspaceFolders};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::git::GitState;
use crate::profile::cli_profile;

/// Why a blob or record command was refused: a stable `kind`, one of
/// `blobRefusalKinds` or `recordRefusalKinds` in
/// `packages/adapters/fs-tauri`, and a message for the log.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct DataRefusal {
    pub(crate) kind: &'static str,
    pub(crate) message: String,
}

impl DataRefusal {
    pub(crate) fn new(kind: &'static str, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub(crate) fn io(error: impl Display) -> Self {
        Self::new("io", error.to_string())
    }
}

/// The folders of `workspace` in `profile`. `workspace` must be a folder
/// the person opened in the shell, or inside one; its real path names the
/// folders, as the CLI's `realpath` does.
pub(crate) fn opened_workspace_folders(
    opened: &OpenedFolders,
    profile: &ProfileFolder,
    workspace: &Path,
) -> Result<WorkspaceFolders, DataRefusal> {
    let real_path = opened.check(workspace).map_err(|_| {
        DataRefusal::new(
            "folder_not_open",
            format!("{} is not an opened folder", workspace.display()),
        )
    })?;
    let real_path = real_path
        .to_str()
        .ok_or_else(|| DataRefusal::io("the workspace's path isn't valid Unicode"))?;
    profile
        .workspace_folders(real_path)
        .map_err(DataRefusal::io)
}

/// Runs `call` with the folders of the workspace the page named, on a
/// worker thread: it reads and writes files, and may wait for another
/// writer's lock.
pub(crate) async fn in_workspace<R, T, F>(
    app: AppHandle<R>,
    workspace: PathBuf,
    call: F,
) -> Result<T, DataRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(&AppHandle<R>, WorkspaceFolders) -> Result<T, DataRefusal> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let profile = cli_profile(&app).map_err(DataRefusal::io)?;
        let opened = app.state::<GitState>().folders();
        let folders = opened_workspace_folders(&opened, &profile, &workspace)?;
        call(&app, folders)
    })
    .await
    .map_err(DataRefusal::io)?
}

#[cfg(test)]
#[path = "workspace_data_tests.rs"]
mod tests;
