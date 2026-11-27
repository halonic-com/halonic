//! What the shell tells the Studio page about updates: `update_status()` and
//! the `update://status` event carry an [`UpdateStatus`] as JSON. One state
//! per row of flow-install-update 4.3; the page words them.

use serde::{Deserialize, Serialize};

use crate::Managed;
use crate::notes::OfferedNotes;
use crate::track::UpdateTrack;

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
    /// Set when another tool updates this install (Scoop): Studio then
    /// downloads and installs nothing, and shows `command` instead of
    /// "Restart to update" (HAL-1452).
    pub managed: Option<Managed>,
    /// The update found or ready raises srt's Windows setup version, so
    /// installing it asks for administrator rights once more where the agent
    /// sandbox is set up (HAL-5404). Always false off Windows.
    pub sandbox_setup_again: bool,
    /// Which builds this install updates to (HAL-18480).
    pub track: UpdateTrack,
    pub state: UpdateState,
}

/// The update this start finished.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JustUpdated {
    pub from: String,
    pub to: String,
    /// The settings a migration couldn't carry over (FS6), for Studio to show.
    pub not_carried_over: Vec<String>,
    /// The release page of `to`, so Studio doesn't build its own (HAL-20424).
    pub notes_url: String,
    /// What changed in `to`, kept from its manifest (HAL-19364).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

/// Where the updater is. `notesUrl` is the release page of that version;
/// `changes` is what changed up to it, from its manifest (HAL-19545).
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
        #[serde(flatten)]
        changes: OfferedNotes,
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
        #[serde(flatten)]
        changes: OfferedNotes,
    },
    /// Halonic started on an older version than it installed.
    DidNotInstall {
        version: String,
        attempts: u32,
        notes_url: String,
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
    /// `HTTPS_PROXY` is set but unusable, so nothing was sent (HAL-12966).
    ProxySetting,
    /// The check went through the proxy, and the proxy couldn't be reached
    /// or refused the tunnel.
    Proxy,
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
    /// `HTTPS_PROXY` is set but unusable, so nothing was sent (HAL-12966).
    ProxySetting,
    /// The download went through the proxy, and the proxy couldn't be
    /// reached or refused the tunnel.
    Proxy,
}

/// What `done` and `total` count.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Unit {
    Bytes,
}

/// The release page of `version`, where its notes are.
pub fn notes_url(version: &str) -> String {
    format!(
        "https://github.com/halonic-com/{}/releases/tag/v{version}",
        releases_repo(version)
    )
}

/// Preview builds (`0.1.1-preview.42`, HAL-18308) are published in their own
/// repository, so the main Releases page shows only stable versions
/// (HAL-18474).
fn releases_repo(version: &str) -> &'static str {
    if version.contains("-preview.") {
        "halonic-preview"
    } else {
        "halonic"
    }
}

#[cfg(test)]
#[path = "status_tests.rs"]
mod tests;
