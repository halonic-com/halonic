//! `run_file_save` (HAL-17832): **Save…** for a file a run created, on the
//! run page's Items line. The page names the run and the file's hash, the
//! id its `artifact.created` event gives it, never a path. The shell finds
//! the file in that run's own log, reads its bytes from the workspace's
//! blob folder, shows its own save dialog and writes the bytes only to the
//! file the person picked there. The dialog asks before it replaces a file,
//! and Cancel writes nothing.

use std::path::{Path, PathBuf};

use halonic_blob_store::BlobFolder;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Runtime};

use crate::workspace_data::{DataRefusal, in_workspace};

/// The name the dialog suggests when nothing is left of the run's name.
const FALLBACK_NAME: &str = "file";

/// What `run_file_save` answers: whether the file was written, `false`
/// when the person cancelled the dialog.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct SaveAnswer {
    saved: bool,
}

/// Saves the file run `run_id` created as `hash` where the person picks in
/// the shell's save dialog. Refused as `unknown_artifact` when the run's log
/// has no such file, before any dialog shows.
#[tauri::command]
pub async fn run_file_save<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    run_id: String,
    hash: String,
) -> Result<SaveAnswer, DataRefusal> {
    in_workspace(app, workspace, move |app, folders| {
        let runs = folders.runs_folder(None).map_err(DataRefusal::io)?;
        let log = crate::runs::run_log(app, Path::new(&runs), &run_id)?;
        let blobs = BlobFolder::new(Path::new(&folders.blobs_folder()))?;
        save_file(&log, &blobs, &hash, |suggested| {
            crate::native_dialogs::pick_save_file(app, suggested)
        })
    })
    .await
}

/// Writes the bytes of the file `log` says the run created as `hash` to the
/// file `pick` answers, which is given the name to suggest. `pick` is asked
/// only for a file the log names and the blob folder has.
pub(crate) fn save_file(
    log: &str,
    blobs: &BlobFolder,
    hash: &str,
    pick: impl FnOnce(&str) -> Option<PathBuf>,
) -> Result<SaveAnswer, DataRefusal> {
    let name = created_name(log, hash).ok_or_else(|| {
        DataRefusal::new("unknown_artifact", "The run created no file with this id.")
    })?;
    let bytes = blobs.get(hash)?.ok_or_else(|| {
        DataRefusal::new("missing_blob", "The file's bytes are no longer stored.")
    })?;
    let Some(file) = pick(&suggested_name(&name)) else {
        return Ok(SaveAnswer { saved: false });
    };
    std::fs::write(&file, bytes).map_err(DataRefusal::io)?;
    Ok(SaveAnswer { saved: true })
}

/// The name of the file the log's `artifact.created` with `hash` saved.
fn created_name(log: &str, hash: &str) -> Option<String> {
    log.lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .find(|event| {
            event.get("type").and_then(Value::as_str) == Some("artifact.created")
                && event.get("hash").and_then(Value::as_str) == Some(hash)
        })
        .and_then(|event| event.get("name")?.as_str().map(str::to_owned))
}

/// The run's name for the file as the dialog suggests it: its last part,
/// without control, hidden or direction-changing characters.
fn suggested_name(name: &str) -> String {
    let last = name.rsplit(['/', '\\']).next().unwrap_or_default();
    let kept: String = last
        .chars()
        .filter(|c| !c.is_control() && !is_hidden(*c))
        .collect();
    match kept.trim() {
        "" | "." | ".." => FALLBACK_NAME.to_owned(),
        kept => kept.to_owned(),
    }
}

/// Zero-width and direction-changing characters, which a name could use to
/// look like another.
fn is_hidden(c: char) -> bool {
    matches!(
        c,
        '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2060}'..='\u{2069}' | '\u{FEFF}'
    )
}

#[cfg(test)]
#[path = "run_files_tests.rs"]
mod tests;
