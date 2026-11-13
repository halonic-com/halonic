//! The updater's download (HAL-1206, flow 4.3): fetches what the last check
//! found, reports its progress, stops when no data arrives for 60 s, and
//! keeps the installer only when its signature matches.

use std::time::Instant;

use halonic_update_state::{
    CHECK_TIME_LIMIT, DOWNLOAD_STALL_LIMIT, DownloadFailure, PROGRESS_EVERY, Unit, UpdateState,
    Version, notes_url,
};
use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::{Error as UpdaterError, Update, UpdaterExt};

use super::lock;

/// Starts downloading what the last check found, unless a download runs,
/// one is ready, or this version's signature failed too often.
pub(super) fn start_download<R: Runtime>(app: &AppHandle<R>) {
    let mut inner = lock(app);
    if inner.busy() || inner.managed.is_some() {
        return;
    }
    let Some(found) = inner.found.clone() else {
        return;
    };
    let allowed =
        Version::parse(&found.version).is_some_and(|version| inner.record.may_download(&version));
    if !allowed {
        return;
    }
    inner.state = Some(UpdateState::Downloading {
        version: found.version.clone(),
        done: 0,
        total: None,
        unit: Unit::Bytes,
    });
    inner.notify();
    let task_app = app.clone();
    inner.download = Some(tauri::async_runtime::spawn(async move {
        download(&task_app, &found).await;
    }));
}

/// Downloads `found` and keeps it when its signature matches. The check's
/// 15-second limit would cap the whole download, so it is made again from
/// the check's answer with a limit per read instead: no data for 60 s stops
/// it as stalled.
async fn download<R: Runtime>(app: &AppHandle<R>, found: &Update) {
    let version = found.version.clone();
    let update = app
        .updater_builder()
        .configure_client(|client| {
            client
                .connect_timeout(CHECK_TIME_LIMIT)
                .read_timeout(DOWNLOAD_STALL_LIMIT)
        })
        .build()
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
                            inner.state = Some(UpdateState::Downloading {
                                version: progress_version.clone(),
                                done,
                                total,
                                unit: Unit::Bytes,
                            });
                            inner.notify();
                        }
                    },
                    || {},
                )
                .await;
            downloaded.map(|bytes| Some((update, bytes)))
        }
        Ok(None) => Ok(None),
        Err(error) => Err(error),
    };
    let mut inner = lock(app);
    inner.download = None;
    match result {
        Ok(Some(ready)) => {
            inner.state = Some(UpdateState::Ready {
                notes_url: notes_url(&version),
                version,
            });
            inner.ready = Some(ready);
        }
        Ok(None) => inner.state = Some(UpdateState::UpToDate),
        Err(error) if bad_signature(&error) => {
            eprintln!("updates: the download of {version} was deleted: {error}");
            let attempts = inner.record.count_bad_signature(&version);
            inner.state = Some(UpdateState::SignatureMismatch { version, attempts });
            inner.save();
        }
        Err(error) => {
            eprintln!("updates: the download of {version} failed: {error}");
            inner.state = Some(UpdateState::DownloadFailed {
                reason: download_failure(&error),
                version,
            });
        }
    }
    inner.notify();
}

fn bad_signature(error: &UpdaterError) -> bool {
    matches!(
        error,
        UpdaterError::Minisign(_)
            | UpdaterError::Base64(_)
            | UpdaterError::SignatureUtf8(_)
            | UpdaterError::SignedVersionMismatch { .. }
            | UpdaterError::MissingSignedVersion
    )
}

fn download_failure(error: &UpdaterError) -> DownloadFailure {
    match error {
        UpdaterError::Reqwest(error) if error.is_connect() => DownloadFailure::Offline,
        UpdaterError::Reqwest(error) if error.is_timeout() => DownloadFailure::Stalled,
        UpdaterError::Io(_) => DownloadFailure::Disk,
        _ => DownloadFailure::NoAnswer,
    }
}
