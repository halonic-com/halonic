//! The shell's part of removing Halonic's WSL setup (HAL-10974): whether the
//! removal is offered, the save dialog for the backup file and showing the
//! saved file in the file manager. The removal itself runs in the agent host
//! (`POST /v1/sandbox/remove-wsl`), which checks the file again.
//!
//! The page never names a path to show: the shell remembers the one file the
//! person chose in its own dialog and reveals only that one.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime};

/// The backup file the person chose last in the shell's save dialog.
#[derive(Default)]
pub struct BackupState {
    chosen: Mutex<Option<PathBuf>>,
}

impl BackupState {
    fn remember(&self, file: PathBuf) {
        *self.chosen.lock().unwrap_or_else(|e| e.into_inner()) = Some(file);
    }

    fn chosen(&self) -> Option<PathBuf> {
        self.chosen
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
}

/// Whether the page offers **Remove sandbox setup**: on Windows, when the
/// host runs beside the shell. The host in the distro can't unregister the
/// distro it runs in, and it doesn't serve the route.
#[tauri::command]
pub async fn wsl_removal_offered<R: Runtime>(app: AppHandle<R>) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        cfg!(windows) && crate::agent_host::host_runs_beside_shell(&app)
    })
    .await
    .unwrap_or(false)
}

/// Shows the save dialog for the backup, named `suggested`. Answers the
/// chosen file, or `null` when the person closes the dialog.
#[tauri::command]
pub async fn wsl_backup_choose<R: Runtime>(
    app: AppHandle<R>,
    suggested: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = crate::native_dialogs::pick_backup_file(&app, &suggested) else {
            return Ok(None);
        };
        let text = file
            .to_str()
            .ok_or_else(|| "the file's name isn't text".to_owned())?
            .to_owned();
        app.state::<BackupState>().remember(file);
        Ok(Some(text))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Shows the file chosen last in the file manager. Answers whether there
/// was a file to show.
#[tauri::command]
pub async fn wsl_backup_reveal<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app.state::<BackupState>().chosen().filter(|f| f.is_file()) else {
            return Ok(false);
        };
        tauri_plugin_opener::reveal_item_in_dir(&file)
            .map(|()| true)
            .map_err(|error| format!("the file manager couldn't show the file: {error}"))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::BackupState;

    #[test]
    fn the_last_chosen_file_is_the_one_kept() {
        let state = BackupState::default();
        assert_eq!(state.chosen(), None);
        state.remember("one.tar".into());
        state.remember("two.tar".into());
        assert_eq!(state.chosen(), Some("two.tar".into()));
    }

    #[test]
    fn the_commands_are_granted_to_the_local_main_window_only() {
        // A remote page must never open the save dialog or reveal files.
        let text = include_str!("../capabilities/desktop-sandbox-backup.json");
        let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
        assert_eq!(capability["local"], true);
        assert_eq!(capability["windows"], json!(["main"]));
        assert!(capability.get("remote").is_none(), "{capability}");
        assert_eq!(
            capability["permissions"],
            json!([
                "allow-wsl-removal-offered",
                "allow-wsl-backup-choose",
                "allow-wsl-backup-reveal"
            ])
        );
    }
}
