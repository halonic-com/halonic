//! The check for an install another tool updates (HAL-1452, flow-install-update
//! section 14): Studio reads the version in our Scoop bucket's manifest and
//! says whether it is newer. It never asks the update feed, downloads or
//! installs, and "Check now" and the daily check come here alike. The check
//! follows Halonic's proxy rules, as the updater does (HAL-12966).

use std::sync::Arc;

use halonic_http_guard::{ProxySetting, Refusal};
use halonic_update_state::{
    CHECK_TIME_LIMIT, CheckFailure, CheckResult, UpdateState, Version, bucket_version, notes_url,
};
use reqwest::Url;
use tauri::{AppHandle, Manager, Runtime};

use super::proxy::{ProxyFault, client_for, request_fault, setting_fault};
use super::{Inner, lock, now};
use crate::http_fetch::HttpFetchState;

/// Our bucket's manifest. Scoop reads the same file, so this is the version
/// `scoop update halonic` would install. The repository is S3's (HAL-1453).
const BUCKET_MANIFEST: &str =
    "https://raw.githubusercontent.com/halonic-com/scoop-bucket/main/bucket/halonic.json";

/// Debug builds only: a URL or a file path that stands in for the bucket, to
/// see the "newer version" state without a release.
#[cfg(debug_assertions)]
const BUCKET_OVERRIDE: &str = "HALONIC_BUCKET_MANIFEST";

/// Runs after `check` has marked the check as running.
pub(super) async fn check<R: Runtime>(app: &AppHandle<R>) {
    let setting = app.state::<HttpFetchState>().proxy();
    let result = read_version(&setting).await;
    let mut inner = lock(app);
    apply(&mut inner, result, now());
    inner.save();
    inner.notify();
}

/// Records what the bucket answered. Nothing here can reach a download.
fn apply(inner: &mut Inner, result: Result<String, CheckFailure>, at: u64) {
    inner.checking = false;
    match result {
        Ok(offered) => {
            let newer = Version::parse(&offered)
                .zip(Version::parse(&inner.current))
                .is_some_and(|(offered, current)| offered > current);
            inner.record.last_checked = Some(at);
            if newer {
                inner.record.last_result = Some(CheckResult::Available {
                    version: offered.clone(),
                });
                inner.state = Some(UpdateState::Available {
                    notes_url: notes_url(&offered),
                    version: offered,
                });
            } else {
                inner.record.last_result = Some(CheckResult::UpToDate);
                inner.state = Some(UpdateState::UpToDate);
            }
        }
        Err(reason) => {
            halonic_shell_log::record("updates", format!("the bucket check failed: {reason:?}"));
            inner.record.last_result = Some(CheckResult::CantCheck { reason });
            inner.state = Some(UpdateState::CantCheck { reason });
        }
    }
}

async fn read_version(setting: &Arc<ProxySetting>) -> Result<String, CheckFailure> {
    let text = match standing_in(setting).await {
        Some(text) => text?,
        None => fetch(BUCKET_MANIFEST, setting).await?,
    };
    bucket_version(&text).ok_or(CheckFailure::Unreadable)
}

#[cfg(debug_assertions)]
async fn standing_in(setting: &Arc<ProxySetting>) -> Option<Result<String, CheckFailure>> {
    let source = std::env::var(BUCKET_OVERRIDE).ok()?;
    Some(if source.starts_with("http") {
        fetch(&source, setting).await
    } else {
        std::fs::read_to_string(&source).map_err(|_| CheckFailure::Unreadable)
    })
}

#[cfg(not(debug_assertions))]
async fn standing_in(_setting: &Arc<ProxySetting>) -> Option<Result<String, CheckFailure>> {
    None
}

/// Reads `url` on Halonic's proxy rules. A URL the rules refuse sends
/// nothing; the status names the proxy when an unusable setting or the
/// proxy itself stopped the check, as it does for the updater's check.
async fn fetch(url: &str, setting: &Arc<ProxySetting>) -> Result<String, CheckFailure> {
    let failure = |error: reqwest::Error| match request_fault(setting, &error) {
        Some(fault) => proxy_failure(fault),
        None if error.is_connect() => CheckFailure::Offline,
        None if error.is_decode() || error.is_body() => CheckFailure::Unreadable,
        None => CheckFailure::NoAnswer,
    };
    let url = Url::parse(url).map_err(|_| CheckFailure::NoAnswer)?;
    let refused = |refusal: Refusal| {
        halonic_shell_log::record(
            "updates",
            format!("the bucket check sent nothing: {}", refusal.message()),
        );
        setting_fault(setting).map_or(CheckFailure::NoAnswer, proxy_failure)
    };
    // The updater installs this crypto provider before it builds a client;
    // this check builds one without the updater.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = client_for(&url, setting)
        .map_err(refused)?
        .timeout(CHECK_TIME_LIMIT)
        .build()
        .map_err(failure)?;
    let response = client
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(failure)?;
    response.text().await.map_err(failure)
}

fn proxy_failure(fault: ProxyFault) -> CheckFailure {
    match fault {
        ProxyFault::Setting => CheckFailure::ProxySetting,
        ProxyFault::Unreachable => CheckFailure::Proxy,
    }
}

#[cfg(test)]
#[path = "updates_managed_tests.rs"]
mod tests;
