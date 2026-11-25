//! Tests for `studio.src-tauri.update-track`.

use super::{ENDPOINT, UpdateTrack, track_endpoint};
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
fn update_track_is_stable_when_nothing_chose_one() {
    assert_eq!(UpdateTrack::default(), UpdateTrack::Stable);
    assert_eq!(UpdaterRecord::default().track, UpdateTrack::Stable);
    assert_eq!(read(r#"{"format":1}"#).track, UpdateTrack::Stable);
}

#[test]
fn update_track_preview_is_kept_in_the_record() {
    let record = read(r#"{"format":1,"track":"preview"}"#);
    assert_eq!(record.track, UpdateTrack::Preview);
    assert!(record_text(&record).contains(r#""track": "preview""#));
    assert_eq!(read(&record_text(&record)), record);
}

#[test]
fn update_track_unknown_or_broken_value_is_stable_and_keeps_the_rest_of_the_record() {
    for track in [r#""nightly""#, "3", "null", r#"{"name":"preview"}"#] {
        let record = read(&format!(
            r#"{{"format":1,"automatic":false,"track":{track}}}"#
        ));
        assert_eq!(record.track, UpdateTrack::Stable, "{track}");
        assert!(!record.automatic, "{track}");
    }
}
