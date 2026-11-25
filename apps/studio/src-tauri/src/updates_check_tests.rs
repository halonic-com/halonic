//! Tests for `studio.src-tauri.update-track` (the endpoint the shell asks on
//! each track) and `studio.src-tauri.update-track-key` (the key it checks).

use halonic_update_state::{ENDPOINT, UpdateTrack, track_pubkey};
use serde_json::Value;

use super::{UPDATER_KEYS, track_endpoints};

fn config() -> Value {
    serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json is JSON")
}

/// The updater's endpoints as `tauri.conf.json` writes them.
fn configured() -> Vec<String> {
    config()["plugins"]["updater"]["endpoints"]
        .as_array()
        .expect("the updater's endpoints")
        .iter()
        .map(|endpoint| endpoint.as_str().expect("an endpoint").to_owned())
        .collect()
}

fn asked(track: UpdateTrack) -> Vec<String> {
    track_endpoints(&configured(), track)
        .expect("the endpoints are URLs")
        .iter()
        .map(|url| url.as_str().to_owned())
        .collect()
}

#[test]
fn update_track_the_app_names_only_updates_halonic_com() {
    assert_eq!(configured(), vec![ENDPOINT.to_owned()]);
}

#[test]
fn update_track_stable_install_asks_the_stable_endpoint() {
    assert_eq!(
        asked(UpdateTrack::Stable),
        vec![
            "https://updates.halonic.com/stable/%7B%7Btarget%7D%7D-%7B%7Barch%7D%7D/%7B%7Bcurrent_version%7D%7D"
        ]
    );
}

#[test]
fn update_track_preview_install_asks_the_preview_endpoint() {
    assert_eq!(
        asked(UpdateTrack::Preview),
        vec![
            "https://updates.halonic.com/preview/%7B%7Btarget%7D%7D-%7B%7Barch%7D%7D/%7B%7Bcurrent_version%7D%7D"
        ]
    );
}

#[test]
fn update_track_keeps_a_test_build_endpoint_without_a_track() {
    let local = vec!["http://127.0.0.1:8765/latest.json".to_owned()];
    let urls = track_endpoints(&local, UpdateTrack::Preview).expect("a URL");
    assert_eq!(urls[0].as_str(), local[0]);
}

#[test]
fn update_track_key_preview_checks_its_own_key_and_stable_the_release_key() {
    let release = config()["plugins"]["updater"]["pubkey"]
        .as_str()
        .expect("the release key")
        .to_owned();
    let preview = track_pubkey(UPDATER_KEYS, UpdateTrack::Preview)
        .expect("updater-keys.json names the Preview key")
        .expect("a Preview key");
    assert!(!preview.is_empty());
    assert_ne!(preview, release);
    assert_eq!(
        track_pubkey(UPDATER_KEYS, UpdateTrack::Stable).expect("no key"),
        None
    );
}
