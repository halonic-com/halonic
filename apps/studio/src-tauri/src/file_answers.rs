//! What `fs_write` and `fs_remove` answer, as `FileCommands` in
//! `@halonicjs/adapter-fs-tauri` reads them.

use halonic_workspace_files::{RemoveOutcome, WriteOutcome};
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
