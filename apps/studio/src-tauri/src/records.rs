//! The `record_*` commands (HAL-6175): the record folder `TauriRecordStore`
//! in `packages/adapters/fs-tauri` keeps through the shell, in the same
//! files and under the same write lock as the CLI's `FileRecordStore`. The
//! file work is in the `halonic-record-store` crate; this file finds the
//! record folder: `<profile>/workspaces/<key>/records` for a workspace, or,
//! for the `plugins` scope (HAL-9377), `<profile>/plugin-records`, where the
//! CLI keeps the plugins' install records and settings values. A call names
//! a workspace or a scope, never a path.

use std::path::PathBuf;

use halonic_profile::ProfileFolder;
use halonic_record_store::{
    CollectionLines, RecordFolder, RecordFolders, RecordStoreError, ReplaceOutcome,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::profile::cli_profile;
use crate::runs::OperatingSystem;
use crate::workspace_data::{DataRefusal, in_workspace};

/// The shell's record folders, so its writes take turns.
#[derive(Debug, Default)]
pub struct RecordState {
    folders: RecordFolders<OperatingSystem>,
}

impl From<RecordStoreError> for DataRefusal {
    fn from(error: RecordStoreError) -> Self {
        DataRefusal::new(error.kind(), error.to_string())
    }
}

/// A record folder the shell keeps that belongs to no workspace.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecordScope {
    /// The plugins' records: `pluginRecordsFolder` in `@halonicjs/profile`.
    Plugins,
}

/// The record folder a call names: a workspace the person opened, or a scope.
#[derive(Debug, PartialEq, Eq)]
enum RecordPlace {
    Workspace(PathBuf),
    Scope(RecordScope),
}

impl RecordPlace {
    /// The place a call named. A call names exactly one: a call with both
    /// or neither is the page's bug, and nothing is read or written.
    fn named(workspace: Option<PathBuf>, scope: Option<RecordScope>) -> Result<Self, DataRefusal> {
        match (workspace, scope) {
            (Some(workspace), None) => Ok(Self::Workspace(workspace)),
            (None, Some(scope)) => Ok(Self::Scope(scope)),
            _ => Err(DataRefusal::io(
                "a record call names a workspace or a scope, and not both",
            )),
        }
    }
}

/// One collection's lines in `record_append`.
#[derive(Debug, Deserialize)]
pub struct AppendArgument {
    collection: String,
    lines: String,
}

/// What `record_read` answers: the log's whole lines, their version and the log's path.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct ReadAnswer {
    lines: String,
    version: String,
    file: String,
}

/// What `record_replace` answers: `{ status: "replaced" }` or `{ status: "changed" }`.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct ReplaceAnswer {
    status: &'static str,
}

impl From<ReplaceOutcome> for ReplaceAnswer {
    fn from(outcome: ReplaceOutcome) -> Self {
        let status = match outcome {
            ReplaceOutcome::Replaced => "replaced",
            ReplaceOutcome::Changed => "changed",
        };
        Self { status }
    }
}

/// Appends each collection's lines, all of them or none.
#[tauri::command]
pub async fn record_append<R: Runtime>(
    app: AppHandle<R>,
    workspace: Option<PathBuf>,
    scope: Option<RecordScope>,
    appends: Vec<AppendArgument>,
) -> Result<(), DataRefusal> {
    let appends: Vec<CollectionLines> = appends
        .into_iter()
        .map(|append| CollectionLines {
            collection: append.collection,
            lines: append.lines,
        })
        .collect();
    in_records(app, RecordPlace::named(workspace, scope)?, move |records| {
        let written = records.append(&appends)?;
        log_unreleased_lock("record_append", written.release_error);
        Ok(())
    })
    .await
}

/// The collection's whole lines, their version and the log's path.
#[tauri::command]
pub async fn record_read<R: Runtime>(
    app: AppHandle<R>,
    workspace: Option<PathBuf>,
    scope: Option<RecordScope>,
    collection: String,
) -> Result<ReadAnswer, DataRefusal> {
    in_records(app, RecordPlace::named(workspace, scope)?, move |records| {
        let log = records.read(&collection)?;
        Ok(ReadAnswer {
            lines: log.lines,
            version: log.version,
            file: log.file.display().to_string(),
        })
    })
    .await
}

/// Replaces the collection's log with `lines` while it still has `version`.
#[tauri::command]
pub async fn record_replace<R: Runtime>(
    app: AppHandle<R>,
    workspace: Option<PathBuf>,
    scope: Option<RecordScope>,
    collection: String,
    version: String,
    lines: String,
) -> Result<ReplaceAnswer, DataRefusal> {
    in_records(app, RecordPlace::named(workspace, scope)?, move |records| {
        let written = records.replace(&collection, &version, &lines)?;
        log_unreleased_lock("record_replace", written.release_error);
        Ok(written.outcome.into())
    })
    .await
}

/// Runs `call` on the record folder the page named.
async fn in_records<R, T, F>(
    app: AppHandle<R>,
    place: RecordPlace,
    call: F,
) -> Result<T, DataRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(RecordFolder<'_, OperatingSystem>) -> Result<T, DataRefusal> + Send + 'static,
{
    match place {
        RecordPlace::Workspace(workspace) => {
            in_workspace(app, workspace, move |app, folders| {
                let state = app.state::<RecordState>();
                let root = PathBuf::from(folders.records_folder());
                call(state.folders.folder(&root)?)
            })
            .await
        }
        RecordPlace::Scope(scope) => in_scope(app, scope, call).await,
    }
}

/// Runs `call` on the record folder of `scope` in the CLI's profile, on a
/// worker thread: it reads and writes files, and may wait for a write lock.
async fn in_scope<R, T, F>(app: AppHandle<R>, scope: RecordScope, call: F) -> Result<T, DataRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(RecordFolder<'_, OperatingSystem>) -> Result<T, DataRefusal> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let profile = cli_profile(&app).map_err(DataRefusal::io)?;
        let root = PathBuf::from(scope_folder(&profile, scope));
        let state = app.state::<RecordState>();
        call(state.folders.folder(&root)?)
    })
    .await
    .map_err(DataRefusal::io)?
}

/// The record folder of `scope` in `profile`.
fn scope_folder(profile: &ProfileFolder, scope: RecordScope) -> String {
    match scope {
        RecordScope::Plugins => profile.plugin_records_folder(),
    }
}

/// A lock that couldn't be released after a write is only logged: the write
/// stands, so the page must not try again, and the lock goes stale by itself.
fn log_unreleased_lock(command: &str, error: Option<RecordStoreError>) {
    if let Some(error) = error {
        eprintln!("{command}: the record folder's write lock wasn't released: {error}");
    }
}

#[cfg(test)]
#[path = "records_tests.rs"]
mod tests;
