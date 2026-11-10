//! The `run_*` commands (HAL-2701): the run folders `TauriRunStore` in
//! `packages/adapters/fs-tauri` keeps through the shell, in the same files
//! and under the same lock as the CLI's `FolderRunStore`. The file work is
//! in the `halonic-run-store` crate; this file finds the run folder and
//! runs every call off the main thread.
//!
//! No command takes a path for the store. The page names a workspace it
//! opened in the shell and, for a deployment's runs, the deployment; the
//! shell works out `<profile>/workspaces/<key>/runs` itself, as
//! `runsFolder` in `@halonicjs/profile` does.

use std::path::{Path, PathBuf};

use halonic_git_guard::OpenedFolders;
use halonic_profile::ProfileFolder;
use halonic_run_store::{AppendOutcome, RunFolder, RunFolders, RunStoreError, ThisComputer};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::git::GitState;
use crate::profile::cli_profile;

/// The shell's run folders, so its commands take turns on a run.
#[derive(Debug, Default)]
pub struct RunState {
    folders: RunFolders<OperatingSystem>,
}

/// This computer as the operating system describes it, with the same calls
/// Node makes for the CLI, so both judge a run lock alike.
#[derive(Debug, Default)]
struct OperatingSystem;

impl ThisComputer for OperatingSystem {
    fn host_name(&self) -> Option<String> {
        halonic_process_probe::host_name()
    }

    fn process_alive(&self, pid: u32) -> bool {
        halonic_process_probe::process_alive(pid)
    }
}

/// Why a run command was refused: a stable `kind`, one of `runRefusalKinds`
/// in `packages/adapters/fs-tauri`, and a message for the log.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct RunRefusal {
    kind: &'static str,
    message: String,
}

impl RunRefusal {
    fn io(error: impl std::fmt::Display) -> Self {
        Self {
            kind: "io",
            message: error.to_string(),
        }
    }
}

impl From<RunStoreError> for RunRefusal {
    fn from(error: RunStoreError) -> Self {
        Self {
            kind: error.kind(),
            message: error.to_string(),
        }
    }
}

/// What `run_append` answers: `{ ok: true, lastSeq, snapshotError? }`, or
/// `{ ok: false, reason: "conflict", lastSeq }`.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendAnswer {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<&'static str>,
    last_seq: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    snapshot_error: Option<String>,
}

impl AppendAnswer {
    /// The answer for an append's outcome. A lock that couldn't be released
    /// is only logged: the lines are stored, and it goes stale by itself.
    fn from_outcome(run_id: &str, outcome: AppendOutcome) -> Self {
        match outcome {
            AppendOutcome::Appended {
                last_seq,
                snapshot_error,
                release_error,
            } => {
                if let Some(error) = release_error {
                    eprintln!("run_append: the lock of run {run_id} wasn't released: {error}");
                }
                Self {
                    ok: true,
                    reason: None,
                    last_seq,
                    snapshot_error: snapshot_error.map(|error| error.to_string()),
                }
            }
            AppendOutcome::Conflict { last_seq } => Self {
                ok: false,
                reason: Some("conflict"),
                last_seq,
                snapshot_error: None,
            },
        }
    }
}

/// What `run_snapshot` answers: the snapshot file's text and the log's length.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotAnswer {
    text: String,
    log_events: u64,
}

/// One entry of `run_logs`: a run's whole lines.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogAnswer {
    run_id: String,
    lines: String,
}

/// The run folder of `workspace`, or of its deployment `deployment`, in
/// `profile`. `workspace` must be a folder the person opened in the shell,
/// or inside one; its real path names the folder, as the CLI's
/// `realpath` does.
pub(crate) fn runs_folder(
    opened: &OpenedFolders,
    profile: &ProfileFolder,
    workspace: &Path,
    deployment: Option<&str>,
) -> Result<PathBuf, RunRefusal> {
    let real_path = opened.check(workspace).map_err(|_| RunRefusal {
        kind: "folder_not_open",
        message: format!("{} is not an opened folder", workspace.display()),
    })?;
    let real_path = real_path
        .to_str()
        .ok_or_else(|| RunRefusal::io("the workspace's path isn't valid Unicode"))?;
    let folders = profile
        .workspace_folders(real_path)
        .map_err(RunRefusal::io)?;
    let runs = folders
        .runs_folder(deployment)
        .map_err(|error| RunRefusal {
            kind: "invalid_deployment",
            message: error.to_string(),
        })?;
    Ok(PathBuf::from(runs))
}

/// Runs `call` on the run folder the page named, on a worker thread: it
/// reads and writes files, and may wait for another writer's lock.
async fn in_runs_folder<R, T, F>(
    app: AppHandle<R>,
    workspace: PathBuf,
    deployment: Option<String>,
    call: F,
) -> Result<T, RunRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(RunFolder<'_, OperatingSystem>) -> Result<T, RunRefusal> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let profile = cli_profile(&app).map_err(RunRefusal::io)?;
        let opened = app.state::<GitState>().folders();
        let root = runs_folder(&opened, &profile, &workspace, deployment.as_deref())?;
        let state = app.state::<RunState>();
        call(state.folders.folder(&root)?)
    })
    .await
    .map_err(RunRefusal::io)?
}

/// Appends `lines` when the log's last event is `expectedSeq`, then
/// replaces the snapshot unless `snapshot` is `null`.
#[tauri::command]
pub async fn run_append<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    deployment: Option<String>,
    run_id: String,
    expected_seq: u64,
    lines: String,
    snapshot: Option<String>,
) -> Result<AppendAnswer, RunRefusal> {
    in_runs_folder(app, workspace, deployment, move |runs| {
        let outcome = runs.append(&run_id, expected_seq, &lines, snapshot.as_deref())?;
        Ok(AppendAnswer::from_outcome(&run_id, outcome))
    })
    .await
}

/// The log's whole lines, `""` for a run with no log.
#[tauri::command]
pub async fn run_events<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    deployment: Option<String>,
    run_id: String,
) -> Result<String, RunRefusal> {
    in_runs_folder(app, workspace, deployment, move |runs| {
        Ok(runs.events(&run_id)?)
    })
    .await
}

/// The cached snapshot and the log's length, or `null` when there is none.
#[tauri::command]
pub async fn run_snapshot<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    deployment: Option<String>,
    run_id: String,
) -> Result<Option<SnapshotAnswer>, RunRefusal> {
    in_runs_folder(app, workspace, deployment, move |runs| {
        let stored = runs.snapshot(&run_id)?;
        Ok(stored.map(|stored| SnapshotAnswer {
            text: stored.text,
            log_events: stored.log_events,
        }))
    })
    .await
}

/// Every run's whole lines, sorted by run id, for the page's list.
#[tauri::command]
pub async fn run_logs<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    deployment: Option<String>,
) -> Result<Vec<LogAnswer>, RunRefusal> {
    in_runs_folder(app, workspace, deployment, |runs| {
        let logs = runs.logs()?;
        Ok(logs
            .into_iter()
            .map(|log| LogAnswer {
                run_id: log.run_id,
                lines: log.lines,
            })
            .collect())
    })
    .await
}

#[cfg(test)]
#[path = "runs_tests.rs"]
mod tests;
