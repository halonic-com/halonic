//! The parts allow-list on real URLs, as the redirect policy and the first
//! request see them, and how an answer's range is read. Requirement
//! `studio.src-tauri.sandbox-parts-download`.

use std::sync::Arc;

use halonic_agent_host::parts::{FetchError, PartFetch};
use halonic_http_guard::ProxySetting;
use reqwest::{StatusCode, Url};

use super::{PartDownloader, body_start, part_hop_allowed};

const PIN_URL: &str =
    "https://github.com/halonic-com/halonic/releases/download/v0.1.1/halonic-wsl-3.tar.gz";
const ASSET_URL: &str =
    "https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sp=r";

fn allowed(url: &str, redirects: usize) -> bool {
    part_hop_allowed(&Url::parse(url).expect("a URL"), redirects).is_ok()
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: the pin's URL on
/// either release path, then up to 3 redirects to the asset host.
#[test]
fn release_downloads_and_their_asset_redirects_are_allowed() {
    assert!(allowed(PIN_URL, 0));
    assert!(allowed(
        "https://github.com/halonic-com/halonic-preview/releases/download/v0.2.0/a.tar.gz",
        0
    ));
    assert!(allowed(
        "https://GitHub.com:443/halonic-com/halonic/releases/download/v1/a",
        0
    ));
    assert!(allowed(ASSET_URL, 1));
    assert!(allowed(ASSET_URL, 3));
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: plain HTTP,
/// another port, a user name, another `github.com` path, a redirect to
/// another host, and a fourth redirect are each refused.
#[test]
fn each_other_hop_is_refused() {
    let refused = [
        (
            "http://github.com/halonic-com/halonic/releases/download/v1/a",
            0,
        ),
        (
            "https://github.com:8443/halonic-com/halonic/releases/download/v1/a",
            0,
        ),
        (
            "https://someone@github.com/halonic-com/halonic/releases/download/v1/a",
            0,
        ),
        (
            "https://:secret@github.com/halonic-com/halonic/releases/download/v1/a",
            0,
        ),
        (
            "https://github.com/halonic-com/halonic/archive/refs/heads/main.tar.gz",
            0,
        ),
        (
            "https://github.com/halonic-com/halonic/releases/download/../../../x/y",
            0,
        ),
        (
            "https://github.com/halonic-com/halonic/releases/download/%2e%2e/%2e%2e/x",
            0,
        ),
        (
            "https://github.com/another/halonic/releases/download/v1/a",
            0,
        ),
        (
            "https://github.com.example.org/halonic-com/halonic/releases/download/v1/a",
            0,
        ),
        (ASSET_URL, 0),
        (
            "https://raw.githubusercontent.com/halonic-com/halonic/main/a",
            1,
        ),
        ("https://gist.githubusercontent.com/someone/1/raw/a", 1),
        (
            "https://release-assets.githubusercontent.com.example.org/a",
            1,
        ),
        ("http://release-assets.githubusercontent.com/a", 1),
        (PIN_URL, 1),
        (ASSET_URL, 4),
    ];
    for (url, redirects) in refused {
        assert!(
            !allowed(url, redirects),
            "{url} after {redirects} redirects"
        );
    }
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: a pin URL the
/// allow-list refuses is refused before anything is sent.
#[test]
fn a_refused_pin_url_sends_nothing() {
    let downloader = PartDownloader {
        setting: Arc::new(ProxySetting::None),
    };
    let opened = downloader.open(
        "http://github.com/halonic-com/halonic/releases/download/v1/a",
        0,
    );
    assert!(matches!(opened, Err(FetchError::Refused(_))));
}

/// A `206` from the asked byte resumes there; a `200` starts over; a `206`
/// from another byte or any other status is an error.
#[test]
fn the_answers_range_is_read() {
    assert_eq!(body_start(StatusCode::OK, None, 0), Ok(0));
    assert_eq!(body_start(StatusCode::OK, None, 5), Ok(0));
    let range = Some("bytes 5-17/18");
    assert_eq!(body_start(StatusCode::PARTIAL_CONTENT, range, 5), Ok(5));
    assert!(matches!(
        body_start(StatusCode::PARTIAL_CONTENT, Some("bytes 0-17/18"), 5),
        Err(FetchError::Network(_))
    ));
    assert!(matches!(
        body_start(StatusCode::PARTIAL_CONTENT, None, 5),
        Err(FetchError::Network(_))
    ));
    assert_eq!(
        body_start(StatusCode::NOT_FOUND, None, 0),
        Err(FetchError::Status(404))
    );
}
