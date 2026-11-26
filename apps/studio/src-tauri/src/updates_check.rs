//! One ask for an update, and what its answer means for the status
//! (HAL-1206): the state for a version found, why a check got no usable
//! answer, and whether installing it sets the sandbox up again (HAL-5404).
//! The check asks the endpoint in `tauri.conf.json` with the install's track
//! filled in, `updates.halonic.com/<track>/…` (HAL-18480).

use std::ffi::OsString;

use halonic_update_state::{
    CHECK_TIME_LIMIT, CheckFailure, UpdateState, UpdateTrack, UpdaterRecord, raises_setup_version,
    this_build_setup_version, track_endpoint, track_pubkey,
};
use serde_json::Value;
use tauri::{AppHandle, Runtime, Url};
use tauri_plugin_updater::{Error as UpdaterError, Update, UpdaterBuilder};

use super::proxy::{ProxyFault, proxy_fault, updater_on_proxy_rules};

/// Asks the update server once for `track`'s newest build, on Halonic's
/// proxy rules and within the check's time limit.
pub(super) async fn ask_for_update<R: Runtime>(
    app: &AppHandle<R>,
    track: UpdateTrack,
) -> Result<Option<Update>, UpdaterError> {
    let updater = on_track_key(updater_on_proxy_rules(app, |client| client)?, track)?
        .endpoints(track_endpoints(&configured_endpoints(app), track)?)?
        .timeout(CHECK_TIME_LIMIT)
        .build()?;
    updater.check().await
}

/// The public keys of the tracks whose builds are signed with a key of
/// their own (HAL-18477).
const UPDATER_KEYS: &str = include_str!("../updater-keys.json");

/// `builder`, checking signatures with `track`'s key: Stable keeps the key
/// in `tauri.conf.json`, Preview takes its own from `updater-keys.json`. The
/// check, the download and the install each verify the installer, so all
/// three build their updater through here.
pub(super) fn on_track_key(
    builder: UpdaterBuilder,
    track: UpdateTrack,
) -> Result<UpdaterBuilder, UpdaterError> {
    Ok(match track_pubkey(UPDATER_KEYS, track)? {
        Some(pubkey) => builder.pubkey(pubkey),
        None => builder,
    })
}

/// The updater's endpoints in `tauri.conf.json`, as written there.
fn configured_endpoints<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    let updater = app.config().plugins.0.get("updater");
    let endpoints = updater.and_then(|updater| updater.get("endpoints"));
    endpoints
        .and_then(Value::as_array)
        .map(|endpoints| {
            endpoints
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

/// `configured` with `track` filled in, as URLs.
pub(super) fn track_endpoints(
    configured: &[String],
    track: UpdateTrack,
) -> Result<Vec<Url>, UpdaterError> {
    configured
        .iter()
        .map(|endpoint| Url::parse(&track_endpoint(endpoint, track)).map_err(UpdaterError::from))
        .collect()
}

/// The state for the update the check found, with what changed since
/// `current`: available, unless its signature failed too often.
pub(super) fn available(record: &mut UpdaterRecord, update: &Update, current: &str) -> UpdateState {
    record.offered_state(&update.raw_json, &update.version, current)
}

/// Why a check got no usable answer, by the proxy setting and the updater's
/// error type, never by its message.
pub(super) fn check_failure<R: Runtime>(app: &AppHandle<R>, error: &UpdaterError) -> CheckFailure {
    match proxy_fault(app, error) {
        Some(ProxyFault::Setting) => return CheckFailure::ProxySetting,
        Some(ProxyFault::Unreachable) => return CheckFailure::Proxy,
        None => {}
    }
    match error {
        UpdaterError::Reqwest(error) if error.is_connect() => CheckFailure::Offline,
        UpdaterError::Reqwest(error) if error.is_decode() || error.is_body() => {
            CheckFailure::Unreadable
        }
        UpdaterError::Serialization(_)
        | UpdaterError::Semver(_)
        | UpdaterError::TargetNotFound(_)
        | UpdaterError::TargetsNotFound(_) => CheckFailure::Unreadable,
        _ => CheckFailure::NoAnswer,
    }
}

/// The installer switch that makes our template reopen Halonic (HAL-1139).
/// "Restart to update" passes it; installing at quit doesn't.
const RELAUNCH: &str = "/RELAUNCH";

/// The installer switch that sets the agent sandbox up again after the
/// update's files are in place (HAL-5404). The installer asks for
/// administrator rights only where srt's marker is older than its own srt
/// needs (windows/installer.nsi, `SetUpAgain`).
const SANDBOX_AGAIN: &str = "/SANDBOX=again";

/// Whether installing `update` sets the agent sandbox up again: its srt needs
/// a higher Windows setup version than this build's. Only Windows has that
/// setup.
pub(super) fn sets_up_again(update: &Update) -> bool {
    cfg!(windows) && raises_setup_version(&update.raw_json, this_build_setup_version())
}

/// The switches our installer template gets for `update`, after Tauri's own.
pub(super) fn installer_args(update: &Update, relaunch: bool) -> Vec<OsString> {
    let switches = [(relaunch, RELAUNCH), (sets_up_again(update), SANDBOX_AGAIN)];
    switches
        .into_iter()
        .filter(|(on, _)| *on)
        .map(|(_, switch)| OsString::from(switch))
        .collect()
}

#[cfg(test)]
#[path = "updates_check_tests.rs"]
mod tests;
