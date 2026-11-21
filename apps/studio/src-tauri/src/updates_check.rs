//! One ask for an update, and what its answer means for the status
//! (HAL-1206): the state for a version found, and why a check got no usable
//! answer.

use halonic_update_state::{
    CHECK_TIME_LIMIT, CheckFailure, UpdateState, UpdaterRecord, Version, notes_url,
};
use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::{Error as UpdaterError, Update};

use super::proxy::updater_on_proxy_rules;

/// Asks the update server once, on Halonic's proxy rules and within the
/// check's time limit.
pub(super) async fn ask_for_update<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<Update>, UpdaterError> {
    let updater = updater_on_proxy_rules(app, |client| client)?
        .timeout(CHECK_TIME_LIMIT)
        .build()?;
    updater.check().await
}

/// The state for a version the check found: available, unless its
/// signature failed too often.
pub(super) fn available(record: &mut UpdaterRecord, version: String) -> UpdateState {
    let refused = Version::parse(&version).is_some_and(|parsed| !record.may_download(&parsed));
    match record.bad_signature.as_ref().filter(|_| refused) {
        Some(bad) => UpdateState::SignatureMismatch {
            attempts: bad.count,
            version,
        },
        None => UpdateState::Available {
            notes_url: notes_url(&version),
            version,
        },
    }
}

/// Why a check got no usable answer, by the updater's error type, never by
/// its message.
pub(super) fn check_failure(error: &UpdaterError) -> CheckFailure {
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
