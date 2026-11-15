//! The `instruction_trust_*` commands: the instructions a person trusted for
//! each agent, which `TauriInstructionTrustStore` in `packages/adapters/fs-tauri`
//! keeps through the shell. The records are the CLI's own:
//! `FileInstructionTrustStore` in the profile's `instruction-trust` folder.
//!
//! Only a person trusts instructions, so `instruction_trust_save` asks them
//! itself in a native dialog (the rules are in the `halonic-trust-grant`
//! crate) and writes the record only on a yes. Like `trust.rs`, no command
//! takes a folder for the store, and every call runs off the main thread.

use std::path::PathBuf;

use halonic_trust_grant::{TrustRefusal, TrustState};
use halonic_trust_store::{FileInstructionTrustStore, InstructionKey, InstructionRecord};
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use crate::native_dialogs::ask_to_trust_instructions;
use crate::profile::cli_profile;
use crate::trust::on_worker;

/// The instruction trust records in the profile the CLI uses.
fn instruction_trust_store<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<FileInstructionTrustStore, TrustRefusal> {
    let profile = cli_profile(app).map_err(TrustRefusal::io)?;
    Ok(FileInstructionTrustStore::new(PathBuf::from(
        profile.instruction_trust_folder(),
    )))
}

/// The record for the agent, or `null` when there is none. A record that
/// can't be read, or isn't exactly trusted instructions for the key, is
/// refused as `unreadable`.
#[tauri::command]
pub async fn instruction_trust_get<R: Runtime>(
    app: AppHandle<R>,
    key: InstructionKey,
) -> Result<Option<InstructionRecord>, TrustRefusal> {
    on_worker(app, move |app| Ok(instruction_trust_store(app)?.get(&key)?)).await
}

/// Saves the record, if the person says yes when the shell asks them (see
/// `TrustState::grant_instructions`): refused as `declined` when they say
/// no and as `busy` while another question shows.
#[tauri::command]
pub async fn instruction_trust_save<R: Runtime>(
    app: AppHandle<R>,
    record: Value,
) -> Result<(), TrustRefusal> {
    on_worker(app, move |app| {
        let store = instruction_trust_store(app)?;
        app.state::<TrustState>()
            .grant_instructions(&store, &record, |question| {
                ask_to_trust_instructions(app, question)
            })
    })
    .await
}

/// Deletes the record without reading it; no error when there is none.
#[tauri::command]
pub async fn instruction_trust_remove<R: Runtime>(
    app: AppHandle<R>,
    key: InstructionKey,
) -> Result<(), TrustRefusal> {
    on_worker(app, move |app| {
        Ok(instruction_trust_store(app)?.remove(&key)?)
    })
    .await
}
