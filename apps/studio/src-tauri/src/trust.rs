//! The `pick_folder`, `reopen_folder`, `forget_folder` and `trust_*`
//! commands (HAL-2612, HAL-6637): the folder picker, the picked folders the
//! shell remembers across restarts, and the trust records `TauriTrustStore`
//! in `packages/adapters/fs-tauri` keeps through the shell. The records are
//! the CLI's own: `FileTrustStore` in the profile's `trust` folder, found as
//! `@halonicjs/profile` finds it (`profile.rs`).
//! Which folder a grant may open is in the `halonic-trust-grant` crate; this
//! file wires its rules to the profile, the opened folders and the native
//! dialogs, and runs every call off the main thread.
//!
//! No command takes a folder for the store: the page gives a location or a
//! record, never where the records live.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use halonic_git_guard::plain_path;
use halonic_profile::join_path;
use halonic_trust_grant::{FolderProbe, PickedFolders, TrustRefusal, TrustState};
use halonic_trust_store::FileTrustStore;
use halonic_workspace_files::Fence;
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use crate::files::profile_fence;
use crate::git::GitState;
use crate::native_dialogs::{ask_to_trust, pick_folder as show_folder_picker};
use crate::profile::cli_profile;

/// The trust records in the profile the CLI uses.
fn trust_store<R: Runtime>(app: &AppHandle<R>) -> Result<FileTrustStore, TrustRefusal> {
    let profile = cli_profile(app).map_err(TrustRefusal::io)?;
    Ok(FileTrustStore::new(PathBuf::from(profile.trust_folder())))
}

/// The folders the person picked, which the shell remembers in the profile
/// so it can open them again after a restart (HAL-6637). Only the shell
/// reads and writes this file; the CLI has no use for it.
fn picked_folders<R: Runtime>(app: &AppHandle<R>) -> Result<PickedFolders, TrustRefusal> {
    let profile = cli_profile(app).map_err(TrustRefusal::io)?;
    let file = join_path(
        profile.platform,
        &profile.root,
        &["studio", "picked-folders.json"],
    );
    Ok(PickedFolders::new(file))
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
///
/// The pick is remembered in the profile, so `reopen_folder` can open the
/// folder after a restart. If that fails, the folder is still open for now,
/// so the pick isn't refused; why goes to the log.
#[tauri::command]
pub async fn pick_folder<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, TrustRefusal> {
    on_worker(app, |app| {
        let folders = app.state::<GitState>().folders();
        let state = app.state::<TrustState>();
        let choose = || show_folder_picker(app);
        match picked_folders(app) {
            Ok(list) => state.pick_remembered(&folders, &list, choose),
            Err(refusal) => {
                eprintln!("pick_folder: picks can't be remembered: {refusal:?}");
                state.pick(&folders, choose)
            }
        }
    })
    .await
}

/// The person's Documents folder, in the form grants give locations, or
/// `null` when this computer has none (some Linux setups). The page only
/// shows it; `create_workspace_folder` reads the folder itself, never the
/// page's word for it.
#[tauri::command]
pub async fn documents_folder<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>, TrustRefusal> {
    on_worker(app, |app| Ok(documents_location(app))).await
}

fn documents_location<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let documents = app.path().document_dir().ok()?;
    let canonical = std::fs::canonicalize(documents).ok()?;
    if !canonical.is_dir() {
        return None;
    }
    plain_path(&canonical).into_string().ok()
}

/// Shows the folder picker for the place a new workspace goes in, and keeps
/// the answer in the shell's memory for `create_workspace_folder`. Unlike
/// `pick_folder`, the folder is not opened and not remembered in the
/// profile, so it doesn't show in Recent. Answers its location, or `null`
/// when the person picks nothing.
#[tauri::command]
pub async fn pick_parent_folder<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>, TrustRefusal> {
    on_worker(app, |app| {
        app.state::<TrustState>()
            .pick_parent(|| show_folder_picker(app))
    })
    .await
}

/// Makes the folder `name` in `parent` and opens it as a picked folder, so
/// the file commands accept it. `parent` must be the Documents folder or a
/// folder the person chose with `pick_parent_folder` in this session; the
/// name must be one plain folder name; a folder that exists is never
/// adopted. No trust record is written: the page asks for trust as for any
/// picked folder. Answers the new folder's location.
#[tauri::command]
pub async fn create_workspace_folder<R: Runtime>(
    app: AppHandle<R>,
    parent: String,
    name: String,
) -> Result<String, TrustRefusal> {
    on_worker(app, move |app| {
        let profile = cli_profile(app).map_err(TrustRefusal::io)?;
        let list = picked_folders(app)?;
        let folders = app.state::<GitState>().folders();
        let documents = app.path().document_dir().ok();
        app.state::<TrustState>().create_workspace(
            &folders,
            &list,
            documents.as_deref(),
            |created| profile_fence(&profile, created) == Fence::Whole,
            &parent,
            &name,
        )
    })
    .await
}

/// What is at `name` in `parent`, reading names only, never a file's
/// contents: `"new"` (nothing there), `"empty"`, `"files"` or `"workspace"`
/// (it holds a `workspace.yaml`). Refused as `create_workspace_folder`
/// refuses, and `exists` for a link or a file at the path.
#[tauri::command]
pub async fn probe_workspace_folder<R: Runtime>(
    app: AppHandle<R>,
    parent: String,
    name: String,
) -> Result<FolderProbe, TrustRefusal> {
    on_worker(app, move |app| {
        let profile = cli_profile(app).map_err(TrustRefusal::io)?;
        let documents = app.path().document_dir().ok();
        app.state::<TrustState>().probe_workspace(
            documents.as_deref(),
            |target| profile_fence(&profile, target) == Fence::Whole,
            &parent,
            &name,
        )
    })
    .await
}

/// Opens the folder `name` in `parent`, which exists, as a picked folder,
/// after the shell asks the person the trust question about it (as
/// `trust_grant` does). Answers its location, or `null` when they say no.
/// Checked as `probe_workspace_folder` is, before and after the question.
/// No trust record is written: the page asks for trust as for any picked
/// folder.
#[tauri::command]
pub async fn open_workspace_folder<R: Runtime>(
    app: AppHandle<R>,
    parent: String,
    name: String,
) -> Result<Option<String>, TrustRefusal> {
    on_worker(app, move |app| {
        let profile = cli_profile(app).map_err(TrustRefusal::io)?;
        let list = picked_folders(app)?;
        let folders = app.state::<GitState>().folders();
        let documents = app.path().document_dir().ok();
        app.state::<TrustState>().open_workspace(
            &folders,
            &list,
            documents.as_deref(),
            |target| profile_fence(&profile, target) == Fence::Whole,
            &parent,
            &name,
            |question| ask_to_trust(app, question),
        )
    })
    .await
}

/// Opens a folder the person picked before, after a restart, without the
/// dialog: only a location the shell remembered from a pick, and only while
/// it is still that folder (see `TrustState::reopen`).
#[tauri::command]
pub async fn reopen_folder<R: Runtime>(
    app: AppHandle<R>,
    location: String,
) -> Result<(), TrustRefusal> {
    on_worker(app, move |app| {
        let list = picked_folders(app)?;
        let folders = app.state::<GitState>().folders();
        app.state::<TrustState>().reopen(&folders, &list, &location)
    })
    .await
}

/// Forgets a folder the person picked and closes it, as removing it from
/// Recent does. Its trust record stays. No error when there is none.
#[tauri::command]
pub async fn forget_folder<R: Runtime>(
    app: AppHandle<R>,
    location: String,
) -> Result<(), TrustRefusal> {
    on_worker(app, move |app| {
        let list = picked_folders(app)?;
        let folders = app.state::<GitState>().folders();
        app.state::<TrustState>().forget(&folders, &list, &location)
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

/// Whether each of `locations` is a folder that exists now, by the location
/// as asked. Only a folder the person already trusted is looked at, so the
/// page can't use it to probe the disk: a location without a trust record
/// is left out of the answer.
#[tauri::command]
pub async fn trust_folders_found<R: Runtime>(
    app: AppHandle<R>,
    locations: Vec<String>,
) -> Result<BTreeMap<String, bool>, TrustRefusal> {
    on_worker(app, move |app| {
        let store = trust_store(app)?;
        let mut found = BTreeMap::new();
        for location in locations {
            if store.get(&location)?.is_some() {
                found.insert(location.clone(), Path::new(&location).is_dir());
            }
        }
        Ok(found)
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
