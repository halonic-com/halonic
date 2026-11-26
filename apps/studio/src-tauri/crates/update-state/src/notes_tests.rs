//! Tests for `studio.src-tauri.crates.update-state.update-notes`.

use serde_json::{Value, json};

use super::{MAX_NOTES_CHARS, MAX_NOTES_VERSIONS, OfferedNotes, VersionNotes, offered_notes};
use crate::{UpdateState, UpdaterRecord};

fn listed(versions: &[&str]) -> Value {
    let list: Vec<Value> = versions
        .iter()
        .map(|version| json!({ "version": version, "notes": format!("- In {version}.") }))
        .collect();
    json!({ "version": versions[0], "notes": "- Own notes.", "halonic": { "releaseNotes": list } })
}

/// Like `listed`, but every entry's notes are short whatever its version, so
/// only the version's own length counts toward the cap.
fn listed_with_short_notes(versions: &[&str]) -> Value {
    let list: Vec<Value> = versions
        .iter()
        .map(|version| json!({ "version": version, "notes": "- Fixed." }))
        .collect();
    json!({ "version": versions[0], "notes": "- Own notes.", "halonic": { "releaseNotes": list } })
}

fn versions(notes: &OfferedNotes) -> Vec<&str> {
    notes
        .release_notes
        .iter()
        .map(|entry| entry.version.as_str())
        .collect()
}

#[test]
fn update_notes_a_check_passes_the_manifest_notes_on() {
    let manifest = json!({ "version": "0.4.2", "notes": "- Fixed X." });
    let state = UpdaterRecord::default().offered_state(&manifest, "0.4.2", "0.4.1");
    let UpdateState::Available { ref changes, .. } = state else {
        panic!("expected available, got {state:?}");
    };
    assert_eq!(changes.notes.as_deref(), Some("- Fixed X."));
    assert_eq!(
        serde_json::to_value(&state).expect("JSON"),
        json!({
            "kind": "available",
            "version": "0.4.2",
            "notesUrl": "https://github.com/halonic-com/halonic/releases/tag/v0.4.2",
            "notes": "- Fixed X.",
            "releaseNotes": [{ "version": "0.4.2", "notes": "- Fixed X." }]
        })
    );
}

#[test]
fn update_notes_shows_every_version_skipped_newest_first() {
    let manifest = listed(&["0.4.4", "0.4.3", "0.4.2", "0.4.1", "0.4.0"]);
    let notes = offered_notes(&manifest, "0.4.1", "0.4.4");
    assert_eq!(versions(&notes), ["0.4.4", "0.4.3", "0.4.2"]);
    assert_eq!(notes.release_notes[1].notes, "- In 0.4.3.");
    assert_eq!(notes.notes.as_deref(), Some("- Own notes."));
    assert!(!notes.older_on_release_page);
}

#[test]
fn update_notes_orders_by_version_ignoring_build_metadata() {
    let manifest = listed(&["0.4.3+build.9", "0.4.5", "0.4.2", "0.4.4", "not a version"]);
    let notes = offered_notes(&manifest, "0.4.1+build.1", "0.4.4");
    assert_eq!(versions(&notes), ["0.4.4", "0.4.3", "0.4.2"]);
    assert!(notes.older_on_release_page);
}

#[test]
fn update_notes_points_to_the_release_page_when_the_list_stops_early() {
    let manifest = listed(&["0.4.4", "0.4.3"]);
    let notes = offered_notes(&manifest, "0.4.1", "0.4.4");
    assert_eq!(versions(&notes), ["0.4.4", "0.4.3"]);
    assert!(notes.older_on_release_page);
}

#[test]
fn update_notes_takes_preview_builds_in_order() {
    let manifest = listed(&["0.4.1-preview.5", "0.4.1-preview.4", "0.4.1-preview.3"]);
    let notes = offered_notes(&manifest, "0.4.1-preview.3", "0.4.1-preview.5");
    assert_eq!(versions(&notes), ["0.4.1-preview.5", "0.4.1-preview.4"]);
}

#[test]
fn update_notes_falls_back_to_the_offered_notes_without_a_list() {
    let manifest =
        json!({ "version": "0.4.4", "notes": "- Fixed X.", "halonic": { "releaseNotes": [] } });
    let notes = offered_notes(&manifest, "0.4.1", "0.4.4");
    assert_eq!(
        notes.release_notes,
        [VersionNotes {
            version: "0.4.4".to_owned(),
            notes: "- Fixed X.".to_owned()
        }]
    );
    assert!(!notes.older_on_release_page);
}

#[test]
fn update_notes_sends_nothing_when_the_manifest_has_no_notes() {
    let state =
        UpdaterRecord::default().offered_state(&json!({ "version": "0.4.2" }), "0.4.2", "0.4.1");
    let sent = serde_json::to_value(&state).expect("JSON");
    assert_eq!(sent.get("notes"), None);
    assert_eq!(sent.get("releaseNotes"), None);
    assert_eq!(sent.get("olderOnReleasePage"), None);
}

#[test]
fn update_notes_keeps_at_most_fifty_versions() {
    let names: Vec<String> = (1..=60).rev().map(|patch| format!("1.0.{patch}")).collect();
    let names: Vec<&str> = names.iter().map(String::as_str).collect();
    let notes = offered_notes(&listed(&names), "1.0.0", "1.0.60");
    assert_eq!(notes.release_notes.len(), MAX_NOTES_VERSIONS);
    assert_eq!(notes.release_notes[0].version, "1.0.60");
    assert!(notes.older_on_release_page);
    let sent = serde_json::to_value(&notes).expect("JSON");
    assert_eq!(sent["olderOnReleasePage"], json!(true));
}

#[test]
fn update_notes_drops_build_metadata_of_any_length() {
    let long = format!("0.4.3+{}", "x".repeat(200_000));
    let manifest = listed_with_short_notes(&["0.4.4", &long, "0.4.1"]);
    let notes = offered_notes(&manifest, "0.4.1", "0.4.4");
    assert_eq!(versions(&notes), ["0.4.4", "0.4.3"]);
    assert!(!notes.older_on_release_page);
}

#[test]
fn update_notes_counts_versions_toward_the_character_cap() {
    let long = format!("0.4.3-{}", "a".repeat(200_000));
    let manifest = listed_with_short_notes(&["0.4.4", &long, "0.4.1"]);
    let notes = offered_notes(&manifest, "0.4.1", "0.4.4");
    assert_eq!(versions(&notes), ["0.4.4"]);
    assert!(notes.older_on_release_page);
    let sent: usize = notes
        .release_notes
        .iter()
        .map(|entry| entry.version.chars().count() + entry.notes.chars().count())
        .sum();
    assert!(sent <= MAX_NOTES_CHARS);
}

#[test]
fn update_notes_puts_the_own_notes_under_the_offered_version_the_list_leaves_out() {
    let manifest = listed(&["0.4.3", "0.4.2", "0.4.1"]);
    let notes = offered_notes(&manifest, "0.4.1", "0.4.4");
    assert_eq!(versions(&notes), ["0.4.4", "0.4.3", "0.4.2"]);
    assert_eq!(notes.release_notes[0].notes, "- Own notes.");
}

#[test]
fn update_state_notes_keep_lines_and_tabs_and_drop_other_control_characters() {
    let manifest = json!({
        "version": "0.4.2",
        "notes": "- Faster start\r\n- \tUpdate button\u{1b}[31m\u{0}\u{7f}",
        "halonic": { "releaseNotes": [{ "version": "0.4.2", "notes": "- Listed\u{1b}[2J" }] }
    });
    let changes = offered_notes(&manifest, "0.4.1", "0.4.2");
    assert_eq!(
        changes.notes.as_deref(),
        Some("- Faster start\n- \tUpdate button[31m")
    );
    assert_eq!(changes.release_notes[0].notes, "- Listed[2J");
    let markup = json!({ "version": "0.4.2", "notes": "<a href=\"https://x.test\">x</a>" });
    assert_eq!(
        offered_notes(&markup, "0.4.1", "0.4.2").notes.as_deref(),
        Some("<a href=\"https://x.test\">x</a>"),
        "markup stays text; the page never renders it"
    );
}
