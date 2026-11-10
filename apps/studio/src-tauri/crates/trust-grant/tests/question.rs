//! How the question shows a folder, and the refusals the page reads.
//! Requirement `trust-grants`.

use std::path::PathBuf;

use halonic_trust_grant::{TrustRefusal, question_text, shown_path};
use halonic_trust_store::TrustError;

#[test]
fn trust_grants_show_hidden_characters_and_shorten_long_paths_in_the_middle() {
    assert_eq!(
        shown_path("/work/acme\u{202e}dm.exe\n/x\u{200b}"),
        "/work/acme\\u{202e}dm.exe\\u{000a}/x\\u{200b}"
    );
    assert_eq!(
        shown_path("/a\u{2028}b\u{2029}c\u{00ad}d\u{180e}e\u{fff9}f\u{fffb}"),
        "/a\\u{2028}b\\u{2029}c\\u{00ad}d\\u{180e}e\\u{fff9}f\\u{fffb}"
    );
    assert_eq!(shown_path("/work/Café"), "/work/Café");
    let long = format!("/{}/acme-final", "a".repeat(1000));
    let shown = shown_path(&long);
    assert_eq!(shown.chars().count(), 159);
    assert!(shown.starts_with("/aaa"), "{shown}");
    assert!(shown.ends_with("aaa/acme-final"), "{shown}");
    assert!(shown.contains('…'), "{shown}");
    assert!(question_text("/work/acme").ends_with(":\n\n/work/acme"));
}

#[test]
fn trust_grants_name_the_location_and_file_of_an_unreadable_record() {
    let unreadable = TrustRefusal::from(TrustError::Unreadable {
        location: Some("/work/acme".to_owned()),
        file: PathBuf::from("trust").join("a47c.json"),
    });
    let answer = serde_json::to_value(&unreadable).expect("a refusal serialises");
    assert_eq!(answer["kind"], "unreadable");
    assert_eq!(answer["location"], "/work/acme");
    let file = PathBuf::from("trust").join("a47c.json");
    assert_eq!(answer["file"], file.display().to_string());
    let invalid = serde_json::to_value(TrustRefusal::from(TrustError::InvalidRecord))
        .expect("a refusal serialises");
    assert_eq!(
        invalid.as_object().map(|fields| fields.len()),
        Some(2),
        "{invalid}"
    );
}
