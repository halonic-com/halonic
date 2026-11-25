//! Tests for `studio.src-tauri.update-track` and
//! `studio.src-tauri.update-track-key`.

use super::{ENDPOINT, UpdateTrack, install_track, track_endpoint, track_pubkey};
use crate::record::{RecordRead, UpdaterRecord, read_record, record_text};

fn read(text: &str) -> UpdaterRecord {
    match read_record(text) {
        RecordRead::Read(record) => record,
        other => panic!("a record, not {other:?}"),
    }
}

#[test]
fn update_track_stable_asks_the_stable_path_of_updates_halonic_com() {
    assert_eq!(
        track_endpoint(ENDPOINT, UpdateTrack::Stable),
        "https://updates.halonic.com/stable/{{target}}-{{arch}}/{{current_version}}"
    );
}

#[test]
fn update_track_preview_asks_the_preview_path_of_updates_halonic_com() {
    assert_eq!(
        track_endpoint(ENDPOINT, UpdateTrack::Preview),
        "https://updates.halonic.com/preview/{{target}}-{{arch}}/{{current_version}}"
    );
}

#[test]
fn update_track_fills_in_an_endpoint_the_url_parser_encoded() {
    assert_eq!(
        track_endpoint(
            "https://updates.halonic.com/%7B%7Btrack%7D%7D/%7B%7Btarget%7D%7D-%7B%7Barch%7D%7D/%7B%7Bcurrent_version%7D%7D",
            UpdateTrack::Preview
        ),
        "https://updates.halonic.com/preview/%7B%7Btarget%7D%7D-%7B%7Barch%7D%7D/%7B%7Bcurrent_version%7D%7D"
    );
}

#[test]
fn update_track_leaves_an_endpoint_without_a_track_as_it_is() {
    let local = "http://127.0.0.1:8765/latest.json";
    assert_eq!(track_endpoint(local, UpdateTrack::Preview), local);
}

#[test]
fn update_track_with_no_choice_follows_the_build() {
    assert_eq!(UpdaterRecord::default().chosen_track, None);
    assert_eq!(read(r#"{"format":1}"#).chosen_track, None);
    assert_eq!(install_track(None, "0.1.1"), UpdateTrack::Stable);
    assert_eq!(install_track(None, "0.1.1-preview.3"), UpdateTrack::Preview);
    assert_eq!(install_track(None, "0.1.1-rc.1"), UpdateTrack::Stable);
}

#[test]
fn update_track_a_saved_choice_wins_over_the_build() {
    assert_eq!(
        install_track(Some(UpdateTrack::Stable), "0.1.1-preview.3"),
        UpdateTrack::Stable
    );
    assert_eq!(
        install_track(Some(UpdateTrack::Preview), "0.1.1"),
        UpdateTrack::Preview
    );
}

#[test]
fn update_track_the_choice_is_kept_in_the_record() {
    for (name, track) in [
        ("stable", UpdateTrack::Stable),
        ("preview", UpdateTrack::Preview),
    ] {
        let record = read(&format!(r#"{{"format":1,"chosenTrack":"{name}"}}"#));
        assert_eq!(record.chosen_track, Some(track));
        assert!(record_text(&record).contains(&format!(r#""chosenTrack": "{name}""#)));
        assert_eq!(read(&record_text(&record)), record);
    }
}

#[test]
fn update_track_a_record_without_a_choice_writes_none() {
    assert!(!record_text(&UpdaterRecord::default()).contains("chosenTrack"));
}

#[test]
fn update_track_the_old_track_key_is_not_a_choice() {
    // Builds before HAL-18656 wrote "track": "stable" on every start.
    let record = read(r#"{"format":1,"track":"stable"}"#);
    assert_eq!(record.chosen_track, None);
    assert_eq!(
        install_track(record.chosen_track, "0.1.1-preview.3"),
        UpdateTrack::Preview
    );
}

#[test]
fn update_track_unknown_or_broken_choice_is_none_and_keeps_the_rest_of_the_record() {
    for track in [r#""nightly""#, "3", "null", r#"{"name":"preview"}"#] {
        let record = read(&format!(
            r#"{{"format":1,"automatic":false,"chosenTrack":{track}}}"#
        ));
        assert_eq!(record.chosen_track, None, "{track}");
        assert!(!record.automatic, "{track}");
    }
}

#[test]
fn update_track_preview_checks_signatures_with_the_preview_key() {
    let keys = r#"{"preview":{"keyId":"ACME","pubkey":"preview-key"}}"#;
    assert_eq!(
        track_pubkey(keys, UpdateTrack::Preview).expect("a key"),
        Some("preview-key".to_owned())
    );
}

#[test]
fn update_track_stable_keeps_the_release_key() {
    let keys = r#"{"preview":{"pubkey":"preview-key"}}"#;
    assert_eq!(
        track_pubkey(keys, UpdateTrack::Stable).expect("no key"),
        None
    );
    assert_eq!(
        track_pubkey("not JSON", UpdateTrack::Stable).expect("no key"),
        None
    );
}

#[test]
fn update_track_preview_without_its_key_fails_instead_of_using_the_release_key() {
    for keys in ["", "{}", r#"{"preview":{}}"#, r#"{"preview":{"pubkey":3}}"#] {
        assert!(track_pubkey(keys, UpdateTrack::Preview).is_err(), "{keys}");
    }
}
