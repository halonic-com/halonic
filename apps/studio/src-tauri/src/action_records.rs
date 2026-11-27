//! The `action_record_append` and `action_record_read` commands: each action
//! request's record, kept by `halonic-action-send`'s [`RecordFiles`] in the
//! app data folder's `action-records`, one user-only file per request
//! (HAL-18125; architecture note on HAL-17491, 4.2). The page names a
//! request, never a path, and every event passes the allow-list before it
//! is written. The first call of a run deletes the records that finished
//! more than 90 days ago.
//!
//! Like the other `action_*` commands, only the app's own windows are
//! granted them (`capabilities/desktop-actions.json`).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, PoisonError};

use halonic_action_send::{RecordError, RecordFiles};
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use super::{ActionCommandRefusal, ActionState, log};
use crate::action_parts::now_seconds;

/// The records' folder in the app data folder.
const FOLDER: &str = "action-records";

/// Keeps two windows' record calls from writing into one file at once, and
/// remembers whether this run has deleted the old records yet.
#[derive(Default)]
pub struct RecordsState {
    lock: Mutex<()>,
    swept: AtomicBool,
}

impl From<RecordError> for ActionCommandRefusal {
    fn from(error: RecordError) -> Self {
        Self {
            kind: error.kind(),
            message: error.to_string(),
        }
    }
}

fn storage_refusal(message: String) -> ActionCommandRefusal {
    ActionCommandRefusal {
        kind: "storage",
        message,
    }
}

/// Adds one event to its request's record, or refuses it as
/// `refused-event` without writing anything.
#[tauri::command]
pub async fn action_record_append<R: Runtime>(
    app: AppHandle<R>,
    event: Value,
) -> Result<(), ActionCommandRefusal> {
    on_records(app, "action_record_append", move |files, _now| {
        files.append(&event)
    })
    .await
}

/// A request's events, oldest first; empty for a request with no record.
#[tauri::command]
pub async fn action_record_read<R: Runtime>(
    app: AppHandle<R>,
    request: String,
) -> Result<Vec<Value>, ActionCommandRefusal> {
    on_records(app, "action_record_read", move |files, now| {
        let record = files.read(&request, now)?;
        if record.dropped > 0 {
            log(format!(
                "action_record_read: dropped {} line(s) the allow-list refuses",
                record.dropped
            ));
        }
        Ok(record.events)
    })
    .await
}

/// Runs `work` on the records off the UI thread, one call at a time,
/// deleting old records first on the run's first call. A refusal goes to
/// the log with the fields it names, never a value.
async fn on_records<R, T, F>(
    app: AppHandle<R>,
    command: &'static str,
    work: F,
) -> Result<T, ActionCommandRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(&RecordFiles, u64) -> Result<T, RecordError> + Send + 'static,
{
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| storage_refusal(format!("there is no app data folder: {error}")))?;
    let files = RecordFiles::new(data.join(FOLDER));
    let joined = tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ActionState>();
        let records = &state.records;
        let _held = records.lock.lock().unwrap_or_else(PoisonError::into_inner);
        let now = now_seconds();
        if !records.swept.swap(true, Ordering::Relaxed) {
            sweep(&files, now);
        }
        work(&files, now)
    })
    .await;
    match joined {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(error)) => {
            log(format!("{command}: {error}"));
            Err(error.into())
        }
        Err(error) => Err(storage_refusal(format!("{command} didn't finish: {error}"))),
    }
}

fn sweep(files: &RecordFiles, now: u64) {
    let (deleted, problems) = files.sweep(now);
    if deleted > 0 {
        log(format!(
            "deleted {deleted} finished action record(s) older than 90 days"
        ));
    }
    for problem in problems {
        log(format!("an old action record wasn't deleted: {problem}"));
    }
}
