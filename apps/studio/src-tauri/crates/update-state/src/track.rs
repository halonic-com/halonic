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

/// Which builds an install updates to: see [`install_track`].
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

/// `updater-keys.json`: the public keys of the tracks whose builds are
/// signed with a key of their own (HAL-18477).
#[derive(Deserialize)]
struct UpdaterKeys {
    preview: TrackKey,
}

#[derive(Deserialize)]
struct TrackKey {
    pubkey: String,
}

/// The public key `track`'s builds are signed with, read from `keys`, the
/// text of `updater-keys.json`. `None` for Stable, which keeps the `pubkey`
/// in `tauri.conf.json`. Preview builds have their own key, so a release
/// signed with the release key never verifies on the Preview track.
///
/// # Errors
///
/// When `keys` isn't JSON or names no Preview key, on the Preview track only.
pub fn track_pubkey(keys: &str, track: UpdateTrack) -> Result<Option<String>, serde_json::Error> {
    match track {
        UpdateTrack::Stable => Ok(None),
        UpdateTrack::Preview => {
            let keys: UpdaterKeys = serde_json::from_str(keys)?;
            Ok(Some(keys.preview.pubkey))
        }
    }
}

/// The track an install follows: the person's choice, or with none saved,
/// the track its build came from, so a Preview build (`0.1.1-preview.42`)
/// keeps getting Preview builds and every other build Stable (HAL-18656).
pub fn install_track(chosen: Option<UpdateTrack>, current: &str) -> UpdateTrack {
    chosen.unwrap_or_else(|| build_track(current))
}

/// The track `version` was built for.
pub fn build_track(version: &str) -> UpdateTrack {
    if version.contains("-preview.") {
        UpdateTrack::Preview
    } else {
        UpdateTrack::Stable
    }
}

/// Reads the record's `chosenTrack`. Anything but `stable` or `preview`
/// counts as no choice, so a value a newer Halonic wrote, or a broken one,
/// never makes the whole record unreadable.
pub(crate) fn chosen_or_none<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<UpdateTrack>, D::Error> {
    let value = Value::deserialize(deserializer)?;
    Ok(match value.as_str() {
        Some("stable") => Some(UpdateTrack::Stable),
        Some("preview") => Some(UpdateTrack::Preview),
        _ => None,
    })
}

#[cfg(test)]
#[path = "track_tests.rs"]
mod tests;
