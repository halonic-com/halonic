//! Installs another tool keeps up to date (HAL-1452, flow-install-update
//! section 14): Studio's own updater is off there. A marker file next to
//! `Halonic.exe` says so, and for Scoop the install path says so too, in case
//! the marker is gone. The switch is one table, so a later package manager
//! is one more row.

use std::path::Path;

use serde::Serialize;
use serde_json::Value;

/// Who keeps this install up to date.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ManagedBy {
    Scoop,
}

/// A way an install can be managed: the marker file its package writes, the
/// folder part of the install path that gives it away without the marker,
/// and the command that updates it.
struct Manager {
    by: ManagedBy,
    marker: &'static str,
    path_part: Option<&'static str>,
    command: &'static str,
}

const MANAGERS: &[Manager] = &[Manager {
    by: ManagedBy::Scoop,
    marker: "managed-by-scoop",
    path_part: Some("\\scoop\\apps\\"),
    command: "scoop update halonic",
}];

/// What the page needs to say "Updates are managed by Scoop".
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Managed {
    pub by: ManagedBy,
    /// What the person runs in a terminal to update.
    pub command: String,
}

/// Whether the install at `exe` is managed. `has_file` answers whether a file
/// exists, so the rule is testable without a disk. The marker wins; the path
/// is the fallback, compared without case and with either kind of slash.
pub fn detect(exe: &Path, has_file: impl Fn(&Path) -> bool) -> Option<Managed> {
    let folder = exe.parent();
    let path = exe.to_string_lossy().replace('/', "\\").to_lowercase();
    MANAGERS
        .iter()
        .find(|manager| {
            folder.is_some_and(|folder| has_file(&folder.join(manager.marker)))
                || manager.path_part.is_some_and(|part| path.contains(part))
        })
        .map(|manager| Managed {
            by: manager.by,
            command: manager.command.to_owned(),
        })
}

/// The version a Scoop bucket's manifest (`bucket/halonic.json`) offers.
pub fn bucket_version(manifest: &str) -> Option<String> {
    let value: Value = serde_json::from_str(manifest).ok()?;
    value.get("version")?.as_str().map(str::to_owned)
}

#[cfg(test)]
#[path = "managed_tests.rs"]
mod tests;
