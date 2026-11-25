//! The update track (HAL-18474, HAL-18480): Stable gets only real releases,
//! Preview every build that passes the click test. The app only knows our own
//! address, `updates.halonic.com`, one path per track; the Worker there serves
//! the signed manifest and sends the download on to the GitHub asset, so
//! moving the files elsewhere only changes the Worker.

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

/// The updater's endpoint in `tauri.conf.json`. `{{track}}` is ours and is
/// filled in by [`track_endpoint`]; `tauri-plugin-updater` fills in the rest
/// on each check: `{{target}}` is the system (`windows`), `{{arch}}` the
/// processor (`x86_64`) and `{{current_version}}` the version that runs.
pub const ENDPOINT: &str =
    "https://updates.halonic.com/{{track}}/{{target}}-{{arch}}/{{current_version}}";

/// Which builds an install updates to. Stable unless the person chose Preview.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UpdateTrack {
    #[default]
    Stable,
    Preview,
}

impl UpdateTrack {
    /// The track's name in the endpoint's path and in the record.
    pub fn name(self) -> &'static str {
        match self {
            UpdateTrack::Stable => "stable",
            UpdateTrack::Preview => "preview",
        }
    }
}

/// `configured`, an endpoint from `tauri.conf.json`, for `track`: its
/// `{{track}}` replaced by the track's name, also where the URL parser has
/// written the braces as `%7B` and `%7D`. An endpoint without `{{track}}`
/// (the Windows update test's local server) stays as it is.
pub fn track_endpoint(configured: &str, track: UpdateTrack) -> String {
    configured
        .replace("{{track}}", track.name())
        .replace("%7B%7Btrack%7D%7D", track.name())
}

/// Reads the record's `track`. Anything but `preview` is Stable, so a value
/// a newer Halonic wrote, or a broken one, never makes the whole record
/// unreadable and never moves an install off the released builds.
pub(crate) fn track_or_stable<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<UpdateTrack, D::Error> {
    let value = Value::deserialize(deserializer)?;
    Ok(match value.as_str() {
        Some("preview") => UpdateTrack::Preview,
        _ => UpdateTrack::Stable,
    })
}

#[cfg(test)]
#[path = "track_tests.rs"]
mod tests;
