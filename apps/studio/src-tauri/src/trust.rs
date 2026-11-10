//! The `pick_folder` and `trust_*` commands (HAL-2612): the folder picker,
//! and the trust records `TauriTrustStore` in `packages/adapters/fs-tauri`
//! keeps through the shell. The records are the CLI's own: `FileTrustStore`
//! in the profile's `trust` folder, found as `@halonicjs/profile` finds it
//! (`profile.rs`).
//! Which folder a grant may open is in the `halonic-trust-grant` crate; this
//! file wires its rules to the profile, the opened folders and the native
//! dialogs, and runs every call off the main thread.
//!
//! No command takes a folder for the store: the page gives a location or a
//! record, never where the records live.

use std::path::PathBuf;

use halonic_trust_grant::{TrustRefusal, TrustState};
use halonic_trust_store::FileTrustStore;
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use crate::git::GitState;
use crate::native_dialogs::{ask_to_trust, pick_folder as show_folder_picker};
use crate::profile::cli_profile;

/// The trust records in the profile the CLI uses.
fn trust_store<R: Runtime>(app: &AppHandle<R>) -> Result<FileTrustStore, TrustRefusal> {
    let profile = cli_profile(app).map_err(TrustRefusal::io)?;
    Ok(FileTrustStore::new(PathBuf::from(profile.trust_folder())))
}

/// Runs one call on a worker thread: it reads and writes the profile, and a
/// dialog waits for the person, neither of which may hold up the UI.
async fn on_worker<R, T, F>(app: AppHandle<R>, call: F) -> Result<T, TrustRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(&AppHandle<R>) -> Result<T, TrustRefusal> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || call(&app))
        .await
        .map_err(TrustRefusal::io)?
}

/// Shows the folder picker and opens the folder the person picks. Answers
/// its location, as grants give it, or `null` when they pick nothing.
#[tauri::command]
pub async fn pick_folder<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, TrustRefusal> {
    on_worker(app, |app| {
        let folders = app.state::<GitState>().folders();
        let state = app.state::<TrustState>();
        state.pick(&folders, || show_folder_picker(app))
    })
    .await
}

/// The record for `location`, or `null` when there is none.
#[tauri::command]
pub async fn trust_get<R: Runtime>(
    app: AppHandle<R>,
    location: String,
) -> Result<Option<Value>, TrustRefusal> {
    on_worker(app, move |app| Ok(trust_store(app)?.get(&location)?)).await
}

/// Every record, sorted by location. A record for a location the shell
/// can't hold (see `Listing::left_out`) is left out and its file reported
/// on stderr, so one such record doesn't empty the whole list.
#[tauri::command]
pub async fn trust_list<R: Runtime>(app: AppHandle<R>) -> Result<Vec<Value>, TrustRefusal> {
    on_worker(app, |app| {
        let listing = trust_store(app)?.list()?;
        for file in &listing.left_out {
            eprintln!(
                "trust_list: left out {}: its location isn't valid Unicode; \
                 `halonic trust` in the CLI can list and remove it",
                file.display()
            );
        }
        Ok(listing.records)
    })
    .await
}

/// Saves the record and opens its folder, if the person chose the folder
/// (see `TrustState::grant`); the shell asks them itself when they didn't.
#[tauri::command]
pub async fn trust_grant<R: Runtime>(app: AppHandle<R>, record: Value) -> Result<(), TrustRefusal> {
    on_worker(app, move |app| {
        let store = trust_store(app)?;
        let folders = app.state::<GitState>().folders();
        let state = app.state::<TrustState>();
        state.grant(&store, &folders, &record, |question| {
            ask_to_trust(app, question)
        })
    })
    .await
}

/// Closes the folder and deletes its record; no error when there is none.
#[tauri::command]
pub async fn trust_revoke<R: Runtime>(
    app: AppHandle<R>,
    location: String,
) -> Result<(), TrustRefusal> {
    on_worker(app, move |app| {
        let store = trust_store(app)?;
        let folders = app.state::<GitState>().folders();
        app.state::<TrustState>()
            .revoke(&store, &folders, &location)
    })
    .await
}
