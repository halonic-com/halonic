//! The `record_*` commands (HAL-6175): the record folder `TauriRecordStore`
//! in `packages/adapters/fs-tauri` keeps through the shell, in the same
//! files and under the same write lock as the CLI's `FileRecordStore`. The
//! file work is in the `halonic-record-store` crate; this file finds the
//! record folder, `<profile>/workspaces/<key>/records`.

use std::path::PathBuf;

use halonic_record_store::{
    CollectionLines, RecordFolder, RecordFolders, RecordStoreError, ReplaceOutcome,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

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
    workspace: PathBuf,
    appends: Vec<AppendArgument>,
) -> Result<(), DataRefusal> {
    let appends: Vec<CollectionLines> = appends
        .into_iter()
        .map(|append| CollectionLines {
            collection: append.collection,
            lines: append.lines,
        })
        .collect();
    in_records(app, workspace, move |records| {
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
    workspace: PathBuf,
    collection: String,
) -> Result<ReadAnswer, DataRefusal> {
    in_records(app, workspace, move |records| {
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
    workspace: PathBuf,
    collection: String,
    version: String,
    lines: String,
) -> Result<ReplaceAnswer, DataRefusal> {
    in_records(app, workspace, move |records| {
        let written = records.replace(&collection, &version, &lines)?;
        log_unreleased_lock("record_replace", written.release_error);
        Ok(written.outcome.into())
    })
    .await
}

/// Runs `call` on the record folder of the workspace the page named.
async fn in_records<R, T, F>(
    app: AppHandle<R>,
    workspace: PathBuf,
    call: F,
) -> Result<T, DataRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(RecordFolder<'_, OperatingSystem>) -> Result<T, DataRefusal> + Send + 'static,
{
    in_workspace(app, workspace, move |app, folders| {
        let state = app.state::<RecordState>();
        let root = PathBuf::from(folders.records_folder());
        call(state.folders.folder(&root)?)
    })
    .await
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
