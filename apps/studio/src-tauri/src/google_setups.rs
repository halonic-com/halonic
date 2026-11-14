//! The `google_setup_read` command (HAL-9378): the page's one read of the
//! Google setup records the CLI keeps in `<profile>/google/setups`, so the
//! Inbox can show what each account's setup still needs. The file work is
//! the `halonic-record-store` crate's, as for the `record_*` commands.
//!
//! The command takes no argument, so the page names neither a folder nor a
//! collection: the shell reads the one collection the setup records live in,
//! `_google_setups`, from the one folder it works out itself. It only
//! reads. The sealed client secrets and tokens are kept in `google/tokens`,
//! another folder, which no command here opens.

use std::path::Path;

use halonic_profile::{ProfileFolder, join_path};
use halonic_record_store::RecordFolders;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::profile::cli_profile;
use crate::records::RecordState;
use crate::runs::OperatingSystem;
use crate::workspace_data::DataRefusal;

/// The collection `setupCollection` names in `@halonicjs/google-setup`.
const SETUP_COLLECTION: &str = "_google_setups";

/// What `google_setup_read` answers: the setup records' whole lines, and the log's path for messages.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct SetupLines {
    lines: String,
    file: String,
}

/// The setup records' log, `""` when no setup was ever saved.
#[tauri::command]
pub async fn google_setup_read<R: Runtime>(app: AppHandle<R>) -> Result<SetupLines, DataRefusal> {
    tauri::async_runtime::spawn_blocking(move || {
        let profile = cli_profile(&app).map_err(DataRefusal::io)?;
        read_setup_lines(&app.state::<RecordState>().folders, &profile)
    })
    .await
    .map_err(DataRefusal::io)?
}

/// Reads the setup records' log in `profile`'s `google/setups` folder, and nothing else.
fn read_setup_lines(
    folders: &RecordFolders<OperatingSystem>,
    profile: &ProfileFolder,
) -> Result<SetupLines, DataRefusal> {
    let root = join_path(profile.platform, &profile.root, &["google", "setups"]);
    let log = folders.folder(Path::new(&root))?.read(SETUP_COLLECTION)?;
    Ok(SetupLines {
        lines: log.lines,
        file: log.file.display().to_string(),
    })
}

#[cfg(test)]
#[path = "google_setups_tests.rs"]
mod tests;
