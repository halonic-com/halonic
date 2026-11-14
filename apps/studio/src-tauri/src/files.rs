//! The `fs_*` commands (HAL-5761): the workspace's files, which the desktop
//! `DefinitionStore` in `packages/adapters/fs-tauri` keeps through the
//! shell (`fileCommands` there). The file work and every path rule are in
//! the `halonic-workspace-files` crate; this file checks the workspace is a
//! folder the person opened and runs every call off the main thread.
//!
//! Each command takes `workspace`, the absolute path of an opened folder or
//! a folder inside one, as the `run_*` commands do. Its real path is the
//! root every workspace path is under. `fs_list`, `fs_read`, `fs_write` and
//! `fs_remove` also take an optional `folder`: `"review"` works in the
//! workspace's review folder in the profile instead (HAL-1291), which the
//! shell works out itself, as `reviewFolder` in `@halonicjs/profile` does,
//! so the page never names a path outside an opened folder. `"tool-approvals"`
//! works in the approvals of one source in the workspace (HAL-8868): the
//! `source` call argument names it, and the shell works out the folder (see
//! `tool_approvals.rs`).
//!
//! The profile is off limits in a workspace (HAL-7039): with the home folder
//! opened, a workspace path could otherwise reach the trust records, the
//! runs or the picked folders that open after a restart without a dialog.
//! Every workspace call refuses a path in it as private, and lists and
//! watches leave it out. The review folder, which is in the profile, is the
//! shell's own and unaffected.

use std::path::{Path, PathBuf};
use std::time::Duration;

use halonic_blob_store::base64url;
use halonic_git_guard::OpenedFolders;
use halonic_profile::ProfileFolder;
use halonic_workspace_files::{
    EntryKind, Fence, FileError, FolderEntry, FolderReader, FolderSnapshot, WatchMessage, Watches,
    WorkspaceFolder, WriteLocks,
};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, Webview};

use crate::file_answers::{RemoveAnswer, WriteAnswer};
use crate::git::GitState;
use crate::profile::cli_profile;

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

/// Which folder of a workspace a file command works in.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FileFolder {
    /// The workspace's own files, when the page names no folder.
    #[default]
    Workspace,
    /// The assistant's changes to review: one record per file, kept in the
    /// workspace's folder in the profile, never in the workspace (HAL-3417).
    Review,
    /// One source's approvals of listed tools in the opened workspace, kept
    /// in the profile and never in the workspace (HAL-8868). Needs `source`.
    ToolApprovals,
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

/// Where the profile is under a workspace's real path `root`. A call whose
/// profile can't be found is refused, so the fence is never left off.
pub(crate) fn profile_fence(profile: &ProfileFolder, root: &Path) -> Fence {
    Fence::around(root, Path::new(&profile.root))
}

/// The review folder of `workspace` in `profile`, as `reviewFolder` names
/// it. `workspace` must be a folder the person opened in the shell, or
/// inside one; its real path names the folder, as the CLI's `realpath` does.
pub(crate) fn review_root(
    opened: &OpenedFolders,
    profile: &ProfileFolder,
    workspace: &Path,
) -> Result<PathBuf, FileRefusal> {
    let real_path = workspace_root(opened, workspace)?;
    let real_path = real_path
        .to_str()
        .ok_or_else(|| FileRefusal::io("the workspace's path isn't valid Unicode"))?;
    let folders = profile
        .workspace_folders(real_path)
        .map_err(FileRefusal::io)?;
    Ok(PathBuf::from(folders.review_folder()))
}

/// Whether a call may make the folder it works in when it isn't there yet:
/// only a write does, so reading the review folder of a workspace that has
/// none leaves the profile as it was. A remove makes nothing, but is told
/// apart from a read because the tool approvals' lock is held for it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Making {
    Folder,
    Nothing,
    Removing,
}

/// Runs `call` on the folder of the workspace the page named, on a worker
/// thread: it reads and writes files, and may wait for another write's turn.
async fn in_workspace<R, T, F>(
    app: AppHandle<R>,
    workspace: PathBuf,
    folder: Option<FileFolder>,
    source: Option<String>,
    making: Making,
    call: F,
) -> Result<T, FileRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(WorkspaceFolder<'_>) -> Result<T, FileError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let opened = app.state::<GitState>().folders();
        let profile = cli_profile(&app).map_err(FileRefusal::io)?;
        let state = app.state::<FileState>();
        let (root, fence) = match folder.unwrap_or_default() {
            FileFolder::Workspace => {
                let root = workspace_root(&opened, &workspace)?;
                let fence = profile_fence(&profile, &root);
                (root, fence)
            }
            FileFolder::Review => {
                let root = review_root(&opened, &profile, &workspace)?;
                if making == Making::Folder {
                    std::fs::create_dir_all(&root).map_err(FileRefusal::io)?;
                }
                (root, Fence::Outside)
            }
            FileFolder::ToolApprovals => {
                let root =
                    tool_approvals::source_root(&opened, &profile, &workspace, source.as_deref())?;
                let files = WorkspaceFolder::new(root.clone(), &state.locks).private_files();
                return tool_approvals::run(&root, making, files, call);
            }
        };
        Ok(call(
            WorkspaceFolder::new(root, &state.locks).fenced(fence),
        )?)
    })
    .await
    .map_err(FileRefusal::io)?
}

/// Every file under `dir` (`null` for the whole workspace), sorted. `source`
/// goes with the `"tool-approvals"` folder, and is ignored for the others.
#[tauri::command]
pub async fn fs_list<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    folder: Option<FileFolder>,
    source: Option<String>,
    dir: Option<String>,
) -> Result<Vec<String>, FileRefusal> {
    tool_approvals::check_list(folder, dir.as_deref())?;
    in_workspace(
        app,
        workspace,
        folder,
        source,
        Making::Nothing,
        move |files| files.list(dir.as_deref()),
    )
    .await
}

/// The file's text, or `null` when there is no file.
#[tauri::command]
pub async fn fs_read<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    folder: Option<FileFolder>,
    source: Option<String>,
    path: String,
) -> Result<Option<String>, FileRefusal> {
    tool_approvals::check_file(folder, &path)?;
    in_workspace(
        app,
        workspace,
        folder,
        source,
        Making::Nothing,
        move |files| files.read(&path),
    )
    .await
}

/// Writes `text` to the file, when it still holds `expected` (`null` to
/// replace it whatever it holds).
#[tauri::command]
pub async fn fs_write<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    folder: Option<FileFolder>,
    source: Option<String>,
    path: String,
    text: String,
    expected: Option<String>,
) -> Result<WriteAnswer, FileRefusal> {
    tool_approvals::check_file(folder, &path)?;
    in_workspace(
        app,
        workspace,
        folder,
        source,
        Making::Folder,
        move |files| {
            files
                .write(&path, &text, expected.as_deref())
                .map(WriteAnswer::from)
        },
    )
    .await
}

/// Deletes the file; one that isn't there is fine. With `expected` (`"absent"`,
/// a digest, or `"not-text"`), it deletes the file only when it still holds that.
#[tauri::command]
pub async fn fs_remove<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    folder: Option<FileFolder>,
    source: Option<String>,
    path: String,
    expected: Option<String>,
) -> Result<RemoveAnswer, FileRefusal> {
    tool_approvals::check_file(folder, &path)?;
    in_workspace(
        app,
        workspace,
        folder,
        source,
        Making::Removing,
        move |files| match expected.as_deref() {
            None => files.remove(&path).map(|()| RemoveAnswer::Removed),
            Some(expected) => files.remove_if(&path, expected).map(RemoveAnswer::from),
        },
    )
    .await
}

/// One entry of `folder_entries`: `{ path, kind, size? }`. `kind` is `file`,
/// `folder`, `link` or `other`, and only a file has a `size`, as `FolderEntry`
/// in `@halonicjs/ports` has it.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct EntryAnswer {
    path: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<u64>,
}

impl From<FolderEntry> for EntryAnswer {
    fn from(entry: FolderEntry) -> Self {
        Self {
            path: entry.path,
            kind: match entry.kind {
                EntryKind::File => "file",
                EntryKind::Folder => "folder",
                EntryKind::Link => "link",
                EntryKind::Other => "other",
            },
            size: entry.size,
        }
    }
}

/// Runs `call` on the workspace the page named as a read-only
/// [`FolderReader`] (HAL-8144), on a worker thread. The same opened-folder
/// check and profile fence as the file commands apply, so the reader reaches
/// nothing they don't; it only hides no name and lists links.
async fn in_folder_reader<R, T, F>(
    app: AppHandle<R>,
    workspace: PathBuf,
    call: F,
) -> Result<T, FileRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(FolderReader) -> Result<T, FileError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let opened = app.state::<GitState>().folders();
        let profile = cli_profile(&app).map_err(FileRefusal::io)?;
        let root = workspace_root(&opened, &workspace)?;
        let fence = profile_fence(&profile, &root);
        Ok(call(FolderReader::new(root).fenced(fence))?)
    })
    .await
    .map_err(FileRefusal::io)?
}

/// Every entry under `dir` (`null` for the whole workspace), with its kind,
/// links and special files listed but never followed, and no name hidden.
/// `limit` stops it once more entries were found; `recursive: false` lists
/// only what is directly under `dir`.
#[tauri::command]
pub async fn folder_entries<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    dir: Option<String>,
    limit: Option<usize>,
    recursive: Option<bool>,
) -> Result<Vec<EntryAnswer>, FileRefusal> {
    in_folder_reader(app, workspace, move |reader| {
        let entries = reader.entries(dir.as_deref(), limit, recursive.unwrap_or(true))?;
        Ok(entries.into_iter().map(EntryAnswer::from).collect())
    })
    .await
}

/// The file's exact bytes as base64url, or `null` when there is no file.
/// A link or a special file is refused, and never opened.
#[tauri::command]
pub async fn folder_read<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    path: String,
) -> Result<Option<String>, FileRefusal> {
    in_folder_reader(app, workspace, move |reader| {
        Ok(reader.read(&path)?.map(|bytes| base64url::encode(&bytes)))
    })
    .await
}

/// The real location of the entry at `path` (`null` for the workspace
/// itself), or `null` when there is none.
#[tauri::command]
pub async fn folder_location<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    path: Option<String>,
) -> Result<Option<String>, FileRefusal> {
    in_folder_reader(app, workspace, move |reader| {
        reader.location_of(path.as_deref())
    })
    .await
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
        let profile = cli_profile(&app).map_err(FileRefusal::io)?;
        let fence = profile_fence(&profile, &root);
        let scan = move || look_while_open(&opened, &root, &fence);
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

/// One look at `root`, outside `fence`, while it is still an opened folder.
fn look_while_open(
    opened: &OpenedFolders,
    root: &Path,
    fence: &Fence,
) -> Result<FolderSnapshot, FileError> {
    if opened.check(root).is_err() {
        return Err(FileError::Io {
            message: "the workspace is no longer an opened folder".to_owned(),
        });
    }
    FolderSnapshot::of(root, fence)
}

#[path = "tool_approvals.rs"]
mod tool_approvals;

#[cfg(test)]
#[path = "files_tests.rs"]
mod tests;
