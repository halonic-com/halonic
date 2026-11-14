//! The `workspace_key` command (HAL-9378): the key of a workspace the person
//! opened, so the page can look up what the profile keeps for it by key, as
//! `forConnector` in `@halonicjs/google-setup` does. The page only has the
//! folder it opened; the key is a hash of that folder's real path, which
//! only the shell can work out.
//!
//! The key comes from `WorkspaceFolders::key` in the profile crate, the same
//! value that names the folder the `record_*` commands use, so the two can't
//! drift. The command answers the key and nothing else: no folder, no real
//! path. A folder that isn't open is refused like for `record_*`.

use std::path::PathBuf;

use halonic_profile::WorkspaceFolders;
use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::workspace_data::{DataRefusal, in_workspace};

/// What `workspace_key` answers: the 32-character key, in lower-case hex.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct WorkspaceKey {
    key: String,
}

impl From<&WorkspaceFolders> for WorkspaceKey {
    fn from(folders: &WorkspaceFolders) -> Self {
        Self {
            key: folders.key().to_owned(),
        }
    }
}

/// The key of the opened workspace the page named.
#[tauri::command]
pub async fn workspace_key<R: Runtime>(
    app: AppHandle<R>,
    workspace: PathBuf,
) -> Result<WorkspaceKey, DataRefusal> {
    in_workspace(app, workspace, |_, folders| {
        Ok(WorkspaceKey::from(&folders))
    })
    .await
}

#[cfg(test)]
#[path = "workspace_key_tests.rs"]
mod tests;
