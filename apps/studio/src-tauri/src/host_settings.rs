//! The `host_settings_*` commands (HAL-6261): the settings kept where
//! Halonic runs, which `TauriHostSettingsStore` in
//! `packages/adapters/fs-tauri` keeps through the shell. They are the CLI's
//! own: `host.json` in the profile's `settings` folder, found as
//! `@halonicjs/profile` finds it (`profile.rs`). The file's rules are in the
//! `halonic-host-settings` crate; this file wires it to the profile and runs
//! every call off the main thread.
//!
//! No command takes a folder or a file: the page gives a key and a value,
//! never where the settings live.

use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};

use halonic_host_settings::{FileHostSettingsStore, HostSettingsError};
use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, Runtime};

use crate::profile::cli_profile;

/// The shell's one lock for saves, so saves from every window take turns:
/// two windows that save two keys at once keep both.
#[derive(Default)]
pub struct HostSettingsState {
    saving: Mutex<()>,
}

/// Why a `host_settings_*` command was refused: a stable `kind`, one of
/// `hostSettingsRefusalKinds` in `packages/adapters/fs-tauri`, and a
/// message for the log.
#[derive(Debug, Serialize)]
pub struct HostSettingsRefusal {
    kind: &'static str,
    message: String,
}

impl HostSettingsRefusal {
    /// An `io` refusal: finding the profile, or the shell itself, failed.
    fn io(error: impl std::fmt::Display) -> Self {
        Self {
            kind: "io",
            message: error.to_string(),
        }
    }
}

impl From<HostSettingsError> for HostSettingsRefusal {
    fn from(error: HostSettingsError) -> Self {
        Self {
            kind: error.kind(),
            message: error.to_string(),
        }
    }
}

/// The settings in the profile the CLI uses.
fn store<R: Runtime>(app: &AppHandle<R>) -> Result<FileHostSettingsStore, HostSettingsRefusal> {
    let profile = cli_profile(app).map_err(HostSettingsRefusal::io)?;
    Ok(FileHostSettingsStore::new(PathBuf::from(
        profile.settings_folder(),
    )))
}

/// Runs one call on a worker thread: it reads and writes the profile,
/// which must not hold up the UI.
async fn on_worker<R, T, F>(app: AppHandle<R>, call: F) -> Result<T, HostSettingsRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(&AppHandle<R>) -> Result<T, HostSettingsRefusal> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || call(&app))
        .await
        .map_err(HostSettingsRefusal::io)?
}

/// Saves one key, or removes it when `value` is `None`, holding the lock.
fn save<R: Runtime>(
    app: &AppHandle<R>,
    key: &str,
    value: Option<&Value>,
) -> Result<(), HostSettingsRefusal> {
    let store = store(app)?;
    let state = app.state::<HostSettingsState>();
    // A save that panicked left no half-written file (it writes a temporary
    // file and renames it), so the next save may go ahead.
    let _turn = state.saving.lock().unwrap_or_else(PoisonError::into_inner);
    match value {
        Some(value) => store.set(key, value)?,
        None => store.remove(key)?,
    }
    Ok(())
}

/// Every saved value by key; `{}` when none is saved or the file can't be
/// parsed.
#[tauri::command]
pub async fn host_settings_read<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Map<String, Value>, HostSettingsRefusal> {
    on_worker(app, |app| Ok(store(app)?.read()?)).await
}

/// Saves one key's value and leaves every other key as it is.
#[tauri::command]
pub async fn host_settings_set<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    value: Value,
) -> Result<(), HostSettingsRefusal> {
    on_worker(app, move |app| save(app, &key, Some(&value))).await
}

/// Removes one key and leaves every other key as it is; no error when it
/// isn't saved.
#[tauri::command]
pub async fn host_settings_remove<R: Runtime>(
    app: AppHandle<R>,
    key: String,
) -> Result<(), HostSettingsRefusal> {
    on_worker(app, move |app| save(app, &key, None)).await
}
