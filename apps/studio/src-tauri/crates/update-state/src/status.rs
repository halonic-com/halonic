//! What the shell tells the Studio page about updates: `update_status()` and
//! the `update://status` event carry an [`UpdateStatus`] as JSON. One state
//! per row of flow-install-update 4.3; the page words them.

use serde::{Deserialize, Serialize};

/// Everything About Halonic and the status bar need, in one value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// The version that runs.
    pub current: String,
    /// The "Update Halonic automatically" switch.
    pub automatic: bool,
    /// A check runs now; `state` still holds the last result.
    pub checking: bool,
    /// When a check last got an answer, in milliseconds since 1970 (UTC).
    pub last_checked: Option<u64>,
    /// Set on the first start after an update, for the "Updated to" toast.
    pub just_updated: Option<JustUpdated>,
    pub state: UpdateState,
}

/// The update this start finished.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct JustUpdated {
    pub from: String,
    pub to: String,
}

/// Where the updater is. `notesUrl` is the release page of that version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum UpdateState {
    NeverChecked,
    UpToDate,
    CantCheck {
        reason: CheckFailure,
    },
    Available {
        version: String,
        notes_url: String,
    },
    /// Reported from the first byte; `total` is `None` when the server
    /// doesn't say.
    Downloading {
        version: String,
        done: u64,
        total: Option<u64>,
        unit: Unit,
    },
    DownloadFailed {
        version: String,
        reason: DownloadFailure,
    },
    /// The download was deleted. `attempts` counts this version's bad
    /// signatures; from [`crate::MAX_BAD_SIGNATURES`] on it isn't downloaded again.
    SignatureMismatch {
        version: String,
        attempts: u32,
    },
    Ready {
        version: String,
        notes_url: String,
    },
    /// Halonic started on an older version than it installed.
    DidNotInstall {
        version: String,
        attempts: u32,
    },
}

/// Why a check got no usable answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CheckFailure {
    /// No connection could be made.
    Offline,
    /// The server didn't answer in time, or answered with an error.
    NoAnswer,
    /// The answer isn't an update manifest Halonic can read.
    Unreadable,
}

/// Why a download stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DownloadFailure {
    Offline,
    NoAnswer,
    /// No data arrived for [`crate::DOWNLOAD_STALL_LIMIT`].
    Stalled,
    /// The download couldn't be kept.
    Disk,
}

/// What `done` and `total` count.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Unit {
    Bytes,
}

/// The release page of `version`, where its notes are.
pub fn notes_url(version: &str) -> String {
    format!("https://github.com/halonic-com/halonic/releases/tag/v{version}")
}

#[cfg(test)]
#[path = "status_tests.rs"]
mod tests;
