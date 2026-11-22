//! Why a file command was refused, as the page gets it.

use halonic_workspace_files::FileError;
use serde::Serialize;

use crate::profile::ProfileProblem;

/// Why a file command was refused: a stable `kind`, one of
/// `fileRefusalKinds` in `packages/adapters/fs-tauri`, a message for the
/// log and, for `folder_unreadable`, the folder's workspace path.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct FileRefusal {
    pub(super) kind: &'static str,
    pub(super) message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) path: Option<String>,
}

/// A relative `HALONIC_HOME` is `profile_setting`, the rest `io`.
impl From<ProfileProblem> for FileRefusal {
    fn from(problem: ProfileProblem) -> Self {
        Self {
            kind: problem.kind(),
            message: problem.to_string(),
            path: None,
        }
    }
}

impl FileRefusal {
    pub(super) fn io(error: impl std::fmt::Display) -> Self {
        Self {
            kind: "io",
            message: error.to_string(),
            path: None,
        }
    }
}

impl From<FileError> for FileRefusal {
    fn from(error: FileError) -> Self {
        Self {
            kind: error.kind(),
            path: error.folder().map(str::to_owned),
            message: error.to_string(),
        }
    }
}
