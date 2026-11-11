//! The `blob_*` commands (HAL-6175): the blob folder `TauriBlobStore` in
//! `packages/adapters/fs-tauri` keeps through the shell, in the same files
//! as the CLI's `FolderBlobStore`. The file work is in the
//! `halonic-blob-store` crate; this file finds the blob folder,
//! `<profile>/workspaces/<key>/blobs`, and passes the bytes as base64url.

use std::path::{Path, PathBuf};

use halonic_blob_store::{BlobFolder, BlobStoreError, base64url};
use halonic_profile::WorkspaceFolders;
use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::workspace_data::{DataRefusal, in_workspace};

impl From<BlobStoreError> for DataRefusal {
    fn from(error: BlobStoreError) -> Self {
        DataRefusal::new(error.kind(), error.to_string())
    }
}

/// What `blob_put` answers: the hash the shell worked out.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct PutAnswer {
    hash: String,
}

/// Stores the bytes `data`, as strict base64url, and answers their hash.
#[tauri::command]
pub async fn blob_put<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    data: String,
) -> Result<PutAnswer, DataRefusal> {
    in_workspace(app, workspace, move |_, folders| {
        let bytes = decode_data(&data)?;
        let hash = blob_folder(&folders)?.put(&bytes)?;
        Ok(PutAnswer { hash })
    })
    .await
}

/// The bytes stored under `hash`, as base64url, or `null` when there are none.
#[tauri::command]
pub async fn blob_get<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
    hash: String,
) -> Result<Option<String>, DataRefusal> {
    in_workspace(app, workspace, move |_, folders| {
        let bytes = blob_folder(&folders)?.get(&hash)?;
        Ok(bytes.map(|bytes| base64url::encode(&bytes)))
    })
    .await
}

fn blob_folder(folders: &WorkspaceFolders) -> Result<BlobFolder, DataRefusal> {
    Ok(BlobFolder::new(Path::new(&folders.blobs_folder()))?)
}

/// The bytes the page sent, refusing text that isn't strict base64url.
fn decode_data(data: &str) -> Result<Vec<u8>, DataRefusal> {
    base64url::decode(data)
        .ok_or_else(|| DataRefusal::new("invalid_data", "The data isn't strict base64url."))
}

#[cfg(test)]
#[path = "blobs_tests.rs"]
mod tests;
