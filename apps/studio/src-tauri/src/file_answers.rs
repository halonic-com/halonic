//! What `fs_write`, `fs_remove` and `fs_watch` answer, as `FileCommands` in
//! `@halonicjs/adapter-fs-tauri` reads them.

use halonic_workspace_files::{RemoveOutcome, WatchMessage, WriteOutcome};
use serde::Serialize;

/// What `fs_write` answers: `{ status: "written" }` or
/// `{ status: "changed-on-disk", current }`.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum WriteAnswer {
    Written,
    ChangedOnDisk { current: Option<String> },
}

impl From<WriteOutcome> for WriteAnswer {
    fn from(outcome: WriteOutcome) -> Self {
        match outcome {
            WriteOutcome::Written => Self::Written,
            WriteOutcome::ChangedOnDisk { current } => Self::ChangedOnDisk { current },
        }
    }
}

/// What `fs_remove` answers: `{ status: "removed" }`, or, when it was given an
/// `expected` the file no longer holds, `{ status: "changed-on-disk", current }`.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum RemoveAnswer {
    Removed,
    ChangedOnDisk { current: Option<String> },
}

impl From<RemoveOutcome> for RemoveAnswer {
    fn from(outcome: RemoveOutcome) -> Self {
        match outcome {
            RemoveOutcome::Removed => Self::Removed,
            RemoveOutcome::ChangedOnDisk { current } => Self::ChangedOnDisk { current },
        }
    }
}

/// What `fs_watch` answers: `{ watchId }`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchStart {
    pub(crate) watch_id: u32,
}

/// A watch's message on its channel: `{ type: "changed", paths }`, or once
/// `{ type: "failed", kind, message }` when it stops (`kind` names the error).
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum WatchEvent {
    Changed { paths: Vec<String> },
    Failed { kind: &'static str, message: String },
}

impl From<WatchMessage> for WatchEvent {
    fn from(message: WatchMessage) -> Self {
        match message {
            WatchMessage::Changed(paths) => Self::Changed { paths },
            WatchMessage::Failed(error) => Self::Failed {
                kind: error.kind(),
                message: error.to_string(),
            },
        }
    }
}
