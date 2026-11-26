//! Tests for `studio.src-tauri.update-pending`: which files in the pending
//! folder make a finished save, and which go.

use serde_json::json;

use super::{
    PendingRecord, complete_pairs, is_installer, pending_record_text, pending_to_remove,
    read_pending_record,
};
use crate::UpdateTrack;

fn names(names: &[&str]) -> Vec<String> {
    names.iter().map(|name| (*name).to_owned()).collect()
}

#[test]
fn update_pending_a_pair_counts_only_with_both_files() {
    let folder = names(&[
        "Halonic-0.1.2.update",
        "Halonic-0.1.2.json",
        "Halonic-0.1.3.update",
        "Halonic-0.1.4.json",
        "Halonic-0.1.5.update.tmp",
        "Halonic-0.1.5.json",
    ]);
    assert_eq!(complete_pairs(&folder), vec!["0.1.2".to_owned()]);
}

#[test]
fn update_pending_only_the_kept_pair_stays() {
    let folder = names(&[
        "Halonic-0.1.2.update",
        "Halonic-0.1.2.json",
        "Halonic-0.1.3.update",
        "Halonic-0.1.3.json",
        "Halonic-0.1.3.json.tmp",
        "notes.txt",
    ]);
    assert_eq!(
        pending_to_remove(&folder, Some("0.1.3")),
        names(&[
            "Halonic-0.1.2.update",
            "Halonic-0.1.2.json",
            "Halonic-0.1.3.json.tmp",
            "notes.txt",
        ])
    );
    assert_eq!(pending_to_remove(&folder, None), folder);
}

#[test]
fn update_pending_record_round_trips() {
    let record = PendingRecord {
        track: UpdateTrack::Preview,
        update: json!({ "version": "0.1.3", "platforms": {} }),
    };
    assert_eq!(
        read_pending_record(&pending_record_text(&record)),
        Some(record)
    );
    assert_eq!(read_pending_record("{\"track\":\"nightly\"}"), None);
}

#[test]
fn update_pending_installers_are_what_the_limit_counts() {
    assert!(is_installer("Halonic-0.1.1-windows-x64-setup.exe"));
    assert!(is_installer("Halonic-0.1.2.update"));
    assert!(!is_installer("Halonic-0.1.1.srt-setup"));
    assert!(!is_installer("Halonic-0.1.2.json"));
    assert!(!is_installer("Halonic-0.1.2.update.tmp"));
}
