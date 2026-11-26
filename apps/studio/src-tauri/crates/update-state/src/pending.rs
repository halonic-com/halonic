//! The pending update (HAL-19635): a downloaded installer waits in
//! `<profile>/updates/pending/` until it is installed, so a restart doesn't
//! download it again. One pair of files per version: `Halonic-<version>.update`,
//! the installer's bytes, and `Halonic-<version>.json`, the check's answer and
//! the track. The shell writes the bytes first and the record second, each
//! through a `.tmp` file, so a pair with both files is a finished save. The
//! name only pairs the files: the version that counts is the one the signed
//! answer names, which the shell checks before it reuses a pair.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::UpdateTrack;

/// The folder under `<profile>/updates/` the pending update waits in.
pub const PENDING_FOLDER: &str = "pending";

const INSTALLER_SUFFIX: &str = ".update";
const RECORD_SUFFIX: &str = ".json";

/// The installer's bytes of `version`'s pending update.
pub fn pending_installer_name(version: &str) -> String {
    format!("Halonic-{version}{INSTALLER_SUFFIX}")
}

/// The record beside `version`'s pending installer.
pub fn pending_record_name(version: &str) -> String {
    format!("Halonic-{version}{RECORD_SUFFIX}")
}

/// What the record beside a pending installer says: the track it was
/// downloaded on, whose key its signature is checked with, and the check's
/// answer, which the updater restores the update from.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PendingRecord {
    pub track: UpdateTrack,
    pub update: Value,
}

/// The record as the file holds it.
pub fn pending_record_text(record: &PendingRecord) -> String {
    serde_json::to_string_pretty(record).unwrap_or_default()
}

/// The record in `text`, or `None` when it isn't one.
pub fn read_pending_record(text: &str) -> Option<PendingRecord> {
    serde_json::from_str(text).ok()
}

/// The name between `Halonic-` and `suffix`, when `name` is one of the
/// pending folder's own files.
fn stem<'name>(name: &'name str, suffix: &str) -> Option<&'name str> {
    name.strip_prefix("Halonic-")?
        .strip_suffix(suffix)
        .filter(|stem| !stem.is_empty())
}

/// The stems in the pending folder's `names` that have both their installer
/// and their record: the saves that finished. A `.tmp` file never counts.
pub fn complete_pairs(names: &[String]) -> Vec<String> {
    let mut stems: Vec<String> = names
        .iter()
        .filter_map(|name| stem(name, INSTALLER_SUFFIX))
        .filter(|stem| names.contains(&pending_record_name(stem)))
        .map(str::to_owned)
        .collect();
    stems.sort();
    stems
}

/// The names in the pending folder to remove so only `keep`'s pair stays:
/// every other pair, a file without its partner, a `.tmp` file and anything
/// else. With no `keep`, all of them.
pub fn pending_to_remove(names: &[String], keep: Option<&str>) -> Vec<String> {
    let kept = keep.map(|version| {
        [
            pending_installer_name(version),
            pending_record_name(version),
        ]
    });
    names
        .iter()
        .filter(|name| !kept.as_ref().is_some_and(|kept| kept.contains(*name)))
        .cloned()
        .collect()
}

/// Whether `name`, in the kept installers' folder or the pending folder, is
/// an installer: what the board's limit of two counts.
pub fn is_installer(name: &str) -> bool {
    name.ends_with("-setup.exe") || stem(name, INSTALLER_SUFFIX).is_some()
}

#[cfg(test)]
#[path = "pending_tests.rs"]
mod tests;
