//! The `fs_*` commands (HAL-5761): the workspace's files, which the desktop
//! `DefinitionStore` in `packages/adapters/fs-tauri` keeps through the
//! shell (`fileCommands` there). The file work and every path rule are in
//! the `halonic-workspace-files` crate; this file checks the workspace is a
//! folder the person opened and runs every call off the main thread.
//!
//! Each command takes `workspace`, the absolute path of an opened folder or
//! a folder inside one, as the `run_*` commands do. Its real path is the
//! root every workspace path is under.

use std::path::{Path, PathBuf};
use std::time::Duration;

use halonic_git_guard::OpenedFolders;
use halonic_workspace_files::{
    FileError, FolderSnapshot, WatchMessage, Watches, WorkspaceFolder, WriteLocks, WriteOutcome,
};
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, Webview};

use crate::git::GitState;

/// How often a watch looks at the files.
const WATCH_INTERVAL: Duration = Duration::from_secs(1);

/// The shell's file state: the turns writes take on each file, and the open
/// watches.
#[derive(Debug, Default)]
pub struct FileState {
    locks: WriteLocks,
    watches: Watches,
}

/// Why a file command was refused: a stable `kind`, one of
/// `fileRefusalKinds` in `packages/adapters/fs-tauri`, a message for the
/// log and, for `folder_unreadable`, the folder's workspace path.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct FileRefusal {
    kind: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
}

impl FileRefusal {
    fn io(error: impl std::fmt::Display) -> Self {
        Self {
            kind: "io",
            message: error.to_string(),
            path: None,
        }
    }
}

impl From<FileError> for FileRefusal {
    fn from(error: FileError) -> Self {
        Self {
            kind: error.kind(),
            path: error.folder().map(str::to_owned),
            message: error.to_string(),
        }
    }
}

/// What `fs_write` answers: `{ status: "written" }` or
/// `{ status: "changed-on-disk", current }`.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum WriteAnswer {
    Written,
    ChangedOnDisk { current: Option<String> },
}

impl From<WriteOutcome> for WriteAnswer {
    fn from(outcome: WriteOutcome) -> Self {
        match outcome {
            WriteOutcome::Written => Self::Written,
            WriteOutcome::ChangedOnDisk { current } => Self::ChangedOnDisk { current },
        }
    }
}

/// What `fs_watch` answers: `{ watchId }`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchStart {
    watch_id: u32,
}

/// A watch's message on its channel: `{ type: "changed", paths }`, or once
/// `{ type: "failed", message }` when it stops.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum WatchEvent {
    Changed { paths: Vec<String> },
    Failed { message: String },
}

impl From<WatchMessage> for WatchEvent {
    fn from(message: WatchMessage) -> Self {
        match message {
            WatchMessage::Changed(paths) => Self::Changed { paths },
            WatchMessage::Failed(message) => Self::Failed { message },
        }
    }
}

/// The real path of `workspace`, which must be a folder the person opened
/// in the shell, or inside one.
pub(crate) fn workspace_root(
    opened: &OpenedFolders,
    workspace: &Path,
) -> Result<PathBuf, FileRefusal> {
    opened.check(workspace).map_err(|_| FileRefusal {
        kind: "folder_not_open",
        message: format!("{} is not an opened folder", workspace.display()),
        path: None,
    })
}

/// Runs `call` on the workspace the page named, on a worker thread: it
/// reads and writes files, and may wait for another write's turn.
async fn in_workspace<R, T, F>(
    app: AppHandle<R>,
    workspace: PathBuf,
    call: F,
) -> Result<T, FileRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(WorkspaceFolder<'_>) -> Result<T, FileError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let root = workspace_root(&app.state::<GitState>().folders(), &workspace)?;
        let state = app.state::<FileState>();
        Ok(call(WorkspaceFolder::new(root, &state.locks))?)
    })
    .await
    .map_err(FileRefusal::io)?
}

/// Every file under `dir` (`null` for the whole workspace), sorted.
#[tauri::command]
pub async fn fs_list<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    dir: Option<String>,
) -> Result<Vec<String>, FileRefusal> {
    in_workspace(app, workspace, move |folder| folder.list(dir.as_deref())).await
}

/// The file's text, or `null` when there is no file.
#[tauri::command]
pub async fn fs_read<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    path: String,
) -> Result<Option<String>, FileRefusal> {
    in_workspace(app, workspace, move |folder| folder.read(&path)).await
}

/// Writes `text` to the file, when it still holds `expected` (`null` to
/// replace it whatever it holds).
#[tauri::command]
pub async fn fs_write<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    path: String,
    text: String,
    expected: Option<String>,
) -> Result<WriteAnswer, FileRefusal> {
    in_workspace(app, workspace, move |folder| {
        folder
            .write(&path, &text, expected.as_deref())
            .map(WriteAnswer::from)
    })
    .await
}

/// Deletes the file; one that isn't there is fine.
#[tauri::command]
pub async fn fs_remove<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    path: String,
) -> Result<(), FileRefusal> {
    in_workspace(app, workspace, move |folder| folder.remove(&path)).await
}

/// Watches the workspace's files, sending batches of paths to `channel`
/// until the page calls `fs_unwatch`, reloads or closes. It stops with a
/// failure once the folder is no longer open, as when its trust is revoked.
#[tauri::command]
pub async fn fs_watch<R: Runtime>(
    webview: Webview<R>,
    workspace: PathBuf,
    channel: Channel<WatchEvent>,
) -> Result<WatchStart, FileRefusal> {
    let app = webview.app_handle().clone();
    let page = webview.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let opened = app.state::<GitState>().folders();
        let root = workspace_root(&opened, &workspace)?;
        let scan = move || look_while_open(&opened, &root);
        let send = move |message: WatchMessage| channel.send(WatchEvent::from(message)).is_ok();
        let state = app.state::<FileState>();
        let watch_id = state.watches.start(&page, WATCH_INTERVAL, scan, send)?;
        Ok(WatchStart { watch_id })
    })
    .await
    .map_err(FileRefusal::io)?
}

/// Stops the page's watch `watchId`. No message comes after this returns;
/// an id that has stopped already is fine.
#[tauri::command]
pub fn fs_unwatch<R: Runtime>(webview: Webview<R>, watch_id: u32) {
    webview
        .state::<FileState>()
        .watches
        .stop(webview.label(), watch_id);
}

/// Stops every watch of the page `page`. The shell calls this when that
/// page starts loading another document, or its window closes.
pub fn end_page_watches<R: Runtime>(app: &AppHandle<R>, page: &str) {
    if let Some(state) = app.try_state::<FileState>() {
        state.watches.stop_owner(page);
    }
}

/// One look at `root`, while it is still an opened folder.
fn look_while_open(opened: &OpenedFolders, root: &Path) -> Result<FolderSnapshot, FileError> {
    if opened.check(root).is_err() {
        return Err(FileError::Io {
            message: "the workspace is no longer an opened folder".to_owned(),
        });
    }
    FolderSnapshot::of(root)
}

#[cfg(test)]
#[path = "files_tests.rs"]
mod tests;
