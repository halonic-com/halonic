//! The updater's own record, `<profile>/updates/updater.json`: the switch,
//! the last check, the install in progress (flow 4.6, U7) and the bad
//! signatures of one version (flow 4.3, U3). The shell reads and writes the
//! file; this module decides what goes in it.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::status::{CheckFailure, JustUpdated, UpdateState, notes_url};
use crate::version::Version;

/// The record's format. A newer one is never written over (failure path 2).
pub const FORMAT: u64 = 1;

/// A version whose signature failed this many times isn't downloaded again,
/// until a newer version appears.
pub const MAX_BAD_SIGNATURES: u32 = 2;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterRecord {
    pub format: u64,
    #[serde(default = "on")]
    pub automatic: bool,
    /// When the last check started, answered or not (milliseconds since 1970).
    #[serde(default)]
    pub last_attempt: Option<u64>,
    /// When a check last got an answer.
    #[serde(default)]
    pub last_checked: Option<u64>,
    #[serde(default)]
    pub last_result: Option<CheckResult>,
    #[serde(default)]
    pub bad_signature: Option<BadSignature>,
    #[serde(default)]
    pub install: Option<InstallRecord>,
    /// Fields a newer Halonic of the same format wrote, kept as they are.
    #[serde(flatten)]
    pub other: Map<String, Value>,
}

fn on() -> bool {
    true
}

/// The result of the last check, so About Halonic shows it after a restart.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum CheckResult {
    UpToDate,
    CantCheck { reason: CheckFailure },
    Available { version: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BadSignature {
    pub version: String,
    pub count: u32,
}

/// Written just before the installer runs; read at the next start.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstallRecord {
    pub target: String,
    pub from: String,
    /// Installs of `target` that didn't happen.
    pub failures: u32,
    /// The installer ran and no start has looked at the result yet.
    pub pending: bool,
}

/// What a start learns from the install record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StartOutcome {
    Nothing,
    /// The update installed: the "Updated to" toast.
    Updated(JustUpdated),
    /// Still the old version. `counted` is true on the start that counted
    /// this failure, the one that shows the toast.
    DidNotInstall {
        version: String,
        attempts: u32,
        counted: bool,
    },
}

/// What was in the record file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecordRead {
    Read(UpdaterRecord),
    /// A newer Halonic's format: use the defaults and never write the file.
    Newer,
    /// Not a record: use the defaults; the next save replaces it.
    Unreadable,
}

impl Default for UpdaterRecord {
    fn default() -> Self {
        UpdaterRecord {
            format: FORMAT,
            automatic: true,
            last_attempt: None,
            last_checked: None,
            last_result: None,
            bad_signature: None,
            install: None,
            other: Map::new(),
        }
    }
}

/// Reads the record file's text.
pub fn read_record(text: &str) -> RecordRead {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return RecordRead::Unreadable;
    };
    match value.get("format").and_then(Value::as_u64) {
        Some(format) if format > FORMAT => RecordRead::Newer,
        Some(FORMAT) => {
            serde_json::from_value(value).map_or(RecordRead::Unreadable, RecordRead::Read)
        }
        _ => RecordRead::Unreadable,
    }
}

/// The record file's text.
pub fn record_text(record: &UpdaterRecord) -> String {
    let mut text = serde_json::to_string_pretty(record).expect("the record is JSON");
    text.push('\n');
    text
}

impl UpdaterRecord {
    /// What About Halonic shows when Studio starts, before any check.
    pub fn starting_state(&self, current: &Version) -> UpdateState {
        let newer =
            |version: &str| Version::parse(version).is_some_and(|version| version > *current);
        if let Some(install) = self
            .install
            .as_ref()
            .filter(|install| install.failures > 0 && newer(&install.target))
        {
            return UpdateState::DidNotInstall {
                version: install.target.clone(),
                attempts: install.failures,
            };
        }
        if let Some(bad) = self
            .bad_signature
            .as_ref()
            .filter(|bad| bad.count >= MAX_BAD_SIGNATURES && newer(&bad.version))
        {
            return UpdateState::SignatureMismatch {
                version: bad.version.clone(),
                attempts: bad.count,
            };
        }
        match &self.last_result {
            None => UpdateState::NeverChecked,
            Some(CheckResult::CantCheck { reason }) => UpdateState::CantCheck { reason: *reason },
            Some(CheckResult::Available { version }) if newer(version) => UpdateState::Available {
                version: version.clone(),
                notes_url: notes_url(version),
            },
            Some(_) => UpdateState::UpToDate,
        }
    }

    /// Counts a download of `version` whose signature didn't match, and
    /// returns how many of that version did.
    pub fn count_bad_signature(&mut self, version: &str) -> u32 {
        let count = match &self.bad_signature {
            Some(bad) if bad.version == version => bad.count.saturating_add(1),
            _ => 1,
        };
        self.bad_signature = Some(BadSignature {
            version: version.to_owned(),
            count,
        });
        count
    }

    /// Whether `version` may be downloaded: not once its signature failed
    /// [`MAX_BAD_SIGNATURES`] times. A newer version resets the count.
    pub fn may_download(&mut self, version: &Version) -> bool {
        let Some(bad) = &self.bad_signature else {
            return true;
        };
        match Version::parse(&bad.version) {
            Some(old) if old == *version => bad.count < MAX_BAD_SIGNATURES,
            Some(old) if old > *version => true,
            _ => {
                self.bad_signature = None;
                true
            }
        }
    }

    /// Writes down, just before the installer runs, what it installs. A
    /// second try of the same version keeps its count of failures.
    pub fn before_install(&mut self, target: &str, current: &str) {
        let failures = match &self.install {
            Some(install) if install.target == target => install.failures,
            _ => 0,
        };
        self.install = Some(InstallRecord {
            target: target.to_owned(),
            from: current.to_owned(),
            failures,
            pending: true,
        });
    }

    /// Looks at the install record once Halonic runs `running`: the version
    /// it installed means it worked; an older one counts a failure, once per
    /// install; a newer one (installed by hand) or a record that can't be
    /// read clears it.
    pub fn after_start(&mut self, running: &Version) -> StartOutcome {
        let Some(install) = self.install.as_mut() else {
            return StartOutcome::Nothing;
        };
        let target = Version::parse(&install.target);
        if target.as_ref().is_some_and(|target| running < target) {
            let counted = install.pending;
            if counted {
                install.failures = install.failures.saturating_add(1);
                install.pending = false;
            }
            return StartOutcome::DidNotInstall {
                version: install.target.clone(),
                attempts: install.failures,
                counted,
            };
        }
        let updated = target.as_ref() == Some(running) && install.pending;
        let outcome = if updated {
            StartOutcome::Updated(JustUpdated {
                from: install.from.clone(),
                to: install.target.clone(),
                not_carried_over: Vec::new(),
            })
        } else {
            StartOutcome::Nothing
        };
        self.install = None;
        outcome
    }
}

impl UpdaterRecord {
    /// Clears the install record once this version has proved it starts. A
    /// record whose target is newer than `running` stays: it is the way back's
    /// count of an install that didn't happen, and clearing it would lose that
    /// count (HAL-8197).
    pub fn after_proved(&mut self, running: &Version) {
        let failed = self
            .install
            .as_ref()
            .and_then(|install| Version::parse(&install.target))
            .is_some_and(|target| running < &target);
        if !failed {
            self.install = None;
        }
    }
}

#[cfg(test)]
#[path = "record_tests.rs"]
mod tests;
