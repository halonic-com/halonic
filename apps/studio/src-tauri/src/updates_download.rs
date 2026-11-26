//! The updater's download (HAL-1206, flow 4.3): fetches what the last check
//! found, reports its progress, stops when no data arrives for 60 s, and
//! keeps the installer only when its signature matches, in the pending
//! folder (`updates_pending.rs`). A release newer than the ready one
//! downloads while the ready one stays ready, and replaces it once checked.

use std::path::{Path, PathBuf};
use std::time::Instant;

use halonic_update_state::{
    CHECK_TIME_LIMIT, DOWNLOAD_STALL_LIMIT, DownloadFailure, PROGRESS_EVERY, Unit, UpdateState,
    UpdateTrack, Version,
};
use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::{Error as UpdaterError, Update};

use super::check::on_track_key;
use super::lock;
use super::pending::{newer_than, pending_folder, prune, ready_state, write_pending};
use super::proxy::{ProxyFault, proxy_fault, updater_on_proxy_rules};

/// Starts downloading what the last check found, unless a download runs,
/// the ready one is as new, or this version's signature failed too often.
/// Replacing a ready update shows no progress: the ready one stays shown.
pub(super) fn start_download<R: Runtime>(app: &AppHandle<R>) {
    let mut inner = lock(app);
    if inner.download.is_some() || inner.managed.is_some() {
        return;
    }
    let Some(found) = inner.found.clone() else {
        return;
    };
    let replaces = inner
        .ready
        .as_ref()
        .map(|(ready, _)| newer_than(&found.version, &ready.version));
    let allowed =
        Version::parse(&found.version).is_some_and(|version| inner.record.may_download(&version));
    if !allowed || replaces == Some(false) {
        return;
    }
    let Some(folder) = pending_folder(inner.file.as_deref()) else {
        return;
    };
    if replaces.is_none() {
        inner.state = Some(downloading(&found.version, 0, None));
        inner.notify();
    }
    let track = inner.track();
    let current = inner.current.clone();
    let task_app = app.clone();
    inner.download = Some(tauri::async_runtime::spawn(async move {
        download(&task_app, &found, track, &current, folder).await;
    }));
}

fn downloading(version: &str, done: u64, total: Option<u64>) -> UpdateState {
    UpdateState::Downloading {
        version: version.to_owned(),
        done,
        total,
        unit: Unit::Bytes,
    }
}

/// Downloads `found` and keeps it when its signature matches. The check's
/// 15-second limit would cap the whole download, so it is made again from
/// the check's answer with a limit per read instead: no data for 60 s stops
/// it as stalled. The checked installer is written to `folder` before it
/// counts as ready; ready keeps what changed since `current`.
async fn download<R: Runtime>(
    app: &AppHandle<R>,
    found: &Update,
    track: UpdateTrack,
    current: &str,
    folder: PathBuf,
) {
    let version = found.version.clone();
    let update = updater_on_proxy_rules(app, |client| {
        client
            .connect_timeout(CHECK_TIME_LIMIT)
            .read_timeout(DOWNLOAD_STALL_LIMIT)
    })
    .and_then(|builder| on_track_key(builder, track))
    .and_then(|builder| builder.build())
    .and_then(|updater| updater.restore_update(found.raw_json.clone()));
    let result = match update {
        Ok(Some(update)) => {
            let mut done: u64 = 0;
            let mut reported = Instant::now();
            let progress = app.clone();
            let progress_version = version.clone();
            let downloaded = update
                .download(
                    move |chunk, total| {
                        done = done.saturating_add(chunk as u64);
                        if reported.elapsed() >= PROGRESS_EVERY {
                            reported = Instant::now();
                            let mut inner = lock(&progress);
                            if inner.ready.is_none() {
                                inner.state = Some(downloading(&progress_version, done, total));
                                inner.notify();
                            }
                        }
                    },
                    || {},
                )
                .await;
            match downloaded {
                Ok(bytes) => save(update, track, bytes, folder.clone()).await.map(Some),
                Err(error) => Err(error),
            }
        }
        Ok(None) => Ok(None),
        Err(error) => Err(error),
    };
    finish(app, track, version, current, &folder, result);
}

/// Keeps what the download of `version` came to: ready, or why not.
fn finish<R: Runtime>(
    app: &AppHandle<R>,
    track: UpdateTrack,
    version: String,
    current: &str,
    folder: &Path,
    result: Result<Option<(Update, PathBuf)>, UpdaterError>,
) {
    let mut inner = lock(app);
    // The person picked the other track while this finished: its update
    // isn't kept, since it would install with the other track's key.
    if inner.track() != track {
        return;
    }
    inner.download = None;
    let replacing = inner.ready.as_ref().map(|(ready, _)| ready.version.clone());
    match result {
        Ok(Some((update, installer))) => {
            if let Some(old) = replacing {
                halonic_shell_log::record(
                    "updates",
                    format!("replaced pending {old} with {version}"),
                );
            }
            prune(folder, Some(&version));
            inner.state = Some(ready_state(&update, current));
            inner.ready = Some((update, installer));
        }
        // The ready update stays ready when a newer one couldn't replace it.
        Ok(None) if replacing.is_some() => {}
        Err(error) if replacing.is_some() => {
            halonic_shell_log::record(
                "updates",
                format!("{version} didn't replace the pending update: {error}"),
            );
            if bad_signature(&error) {
                inner.record.count_bad_signature(&version);
                inner.save();
            }
        }
        Ok(None) => inner.state = Some(UpdateState::UpToDate),
        Err(error) if bad_signature(&error) => {
            halonic_shell_log::record(
                "updates",
                format!("the download of {version} was deleted: {error}"),
            );
            let attempts = inner.record.count_bad_signature(&version);
            inner.state = Some(UpdateState::SignatureMismatch { version, attempts });
            inner.save();
        }
        Err(error) => {
            halonic_shell_log::record(
                "updates",
                format!("the download of {version} failed: {error}"),
            );
            inner.state = Some(UpdateState::DownloadFailed {
                reason: download_failure(app, &error),
                version,
            });
        }
    }
    inner.notify();
}

/// Writes the checked `bytes` to the pending `folder` off the async
/// threads, and answers the update with the installer's path.
async fn save(
    update: Update,
    track: UpdateTrack,
    bytes: Vec<u8>,
    folder: PathBuf,
) -> Result<(Update, PathBuf), UpdaterError> {
    tauri::async_runtime::spawn_blocking(move || {
        write_pending(&folder, &update, track, &bytes).map(|installer| (update, installer))
    })
    .await
    .map_err(|error| UpdaterError::Io(std::io::Error::other(error.to_string())))?
    .map_err(UpdaterError::Io)
}

/// Whether the updater refused `error`'s installer for its signature.
pub(super) fn bad_signature(error: &UpdaterError) -> bool {
    matches!(
        error,
        UpdaterError::Minisign(_)
            | UpdaterError::Base64(_)
            | UpdaterError::SignatureUtf8(_)
            | UpdaterError::SignedVersionMismatch { .. }
            | UpdaterError::MissingSignedVersion
    )
}

/// Why a download stopped, by the proxy setting and the updater's error
/// type, never by its message.
fn download_failure<R: Runtime>(app: &AppHandle<R>, error: &UpdaterError) -> DownloadFailure {
    match proxy_fault(app, error) {
        Some(ProxyFault::Setting) => return DownloadFailure::ProxySetting,
        Some(ProxyFault::Unreachable) => return DownloadFailure::Proxy,
        None => {}
    }
    match error {
        UpdaterError::Reqwest(error) if error.is_connect() => DownloadFailure::Offline,
        UpdaterError::Reqwest(error) if error.is_timeout() => DownloadFailure::Stalled,
        UpdaterError::Io(_) => DownloadFailure::Disk,
        _ => DownloadFailure::NoAnswer,
    }
}
