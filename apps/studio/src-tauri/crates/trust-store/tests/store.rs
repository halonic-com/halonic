//! The trust-store contract (`contracts.trust-store` in
//! `packages/testing/contracts`), ported to the shell's store, so it keeps
//! records as every `TrustStore` adapter must. Requirement `trust-files`.

mod support;

use halonic_trust_store::TrustError;
use support::{Scratch, grant, locations, record};

#[test]
fn trust_files_start_empty_and_give_back_every_field() {
    let scratch = Scratch::new("empty");
    let store = scratch.store();
    assert_eq!(store.get("/workspaces/acme"), Ok(None));
    assert_eq!(store.list(), Ok(Vec::new()));

    grant(&store, "/workspaces/acme", "hfp1:aa");
    assert_eq!(
        store.get("/workspaces/acme"),
        Ok(Some(record("/workspaces/acme", "hfp1:aa")))
    );
    assert_eq!(
        store.list(),
        Ok(vec![record("/workspaces/acme", "hfp1:aa")])
    );
}

#[test]
fn trust_files_replace_a_record_and_revoke_it() {
    let scratch = Scratch::new("replace");
    let store = scratch.store();
    grant(&store, "/workspaces/acme", "hfp1:old");
    grant(&store, "/workspaces/acme", "hfp1:new");
    assert_eq!(
        store.list(),
        Ok(vec![record("/workspaces/acme", "hfp1:new")])
    );

    store.revoke("/workspaces/acme").unwrap();
    assert_eq!(store.get("/workspaces/acme"), Ok(None));
    // Revoking again, or a location never granted, is not an error.
    store.revoke("/workspaces/acme").unwrap();
    store.revoke("/workspaces/never").unwrap();
    assert_eq!(store.list(), Ok(Vec::new()));
}

#[test]
fn trust_files_compare_locations_exactly_as_given() {
    let scratch = Scratch::new("exact");
    let store = scratch.store();
    grant(&store, "/workspaces/acme", "hfp1:aa");
    for other in [
        "/workspaces/acme/",
        "/Workspaces/acme",
        "/workspaces/./acme",
    ] {
        assert_eq!(store.get(other), Ok(None), "{other}");
    }

    // "café" as one code point and as "e" plus a combining accent.
    let composed = "/workspaces/caf\u{e9}";
    let decomposed = "/workspaces/cafe\u{301}";
    grant(&store, composed, "hfp1:composed");
    assert_eq!(store.get(decomposed), Ok(None));
    grant(&store, decomposed, "hfp1:decomposed");
    assert_eq!(
        store.get(composed),
        Ok(Some(record(composed, "hfp1:composed")))
    );
    assert_eq!(store.list().map(|records| records.len()), Ok(3));
}

#[test]
fn trust_files_list_by_utf16_code_unit() {
    let scratch = Scratch::new("order");
    let store = scratch.store();
    // By code point U+FFFF comes before U+10000; by UTF-16 code unit, as
    // JavaScript sorts, U+10000 (a surrogate pair from 0xD800) comes first.
    let granted = [
        "/workspaces/acme",
        "/a\u{ffff}",
        "/Workspaces/Beta",
        "/a\u{10000}",
        "/hubs/shared",
    ];
    for location in granted {
        grant(&store, location, "hfp1:aa");
    }
    let listed = store.list().unwrap();
    assert_eq!(
        locations(&listed),
        [
            "/Workspaces/Beta",
            "/a\u{10000}",
            "/a\u{ffff}",
            "/hubs/shared",
            "/workspaces/acme",
        ]
    );
}

#[test]
fn trust_files_name_the_location_of_a_record_that_cant_be_read() {
    let scratch = Scratch::new("damaged");
    let store = scratch.store();
    grant(&store, "/workspaces/acme", "hfp1:aa");
    grant(&store, "/workspaces/zeta", "hfp1:aa");
    let file = support::file_for(&scratch, "/workspaces/acme");
    let text = std::fs::read_to_string(&file).unwrap();
    std::fs::write(&file, &text[..text.len() / 2]).unwrap();

    let damaged = TrustError::Unreadable {
        location: Some("/workspaces/acme".to_owned()),
        file: file.clone(),
    };
    assert_eq!(store.get("/workspaces/acme"), Err(damaged.clone()));
    // The cut-off file still starts with its location, so list names it.
    assert_eq!(store.list(), Err(damaged));
    assert_eq!(
        store.get("/workspaces/zeta"),
        Ok(Some(record("/workspaces/zeta", "hfp1:aa")))
    );

    // Granting it again replaces it; revoking deletes it unread.
    grant(&store, "/workspaces/acme", "hfp1:again");
    assert_eq!(
        store.get("/workspaces/acme"),
        Ok(Some(record("/workspaces/acme", "hfp1:again")))
    );
    std::fs::write(&file, "{").unwrap();
    store.revoke("/workspaces/acme").unwrap();
    assert_eq!(store.get("/workspaces/acme"), Ok(None));
}

#[test]
fn trust_files_refuse_a_record_without_a_location() {
    let scratch = Scratch::new("invalid");
    let store = scratch.store();
    for invalid in [
        serde_json::json!("record"),
        serde_json::json!({ "fingerprint": "hfp1:aa" }),
        serde_json::json!({ "location": 7 }),
    ] {
        assert_eq!(store.grant(&invalid), Err(TrustError::InvalidRecord));
    }
    assert!(!scratch.path().join("trust").exists());
    assert_eq!(TrustError::InvalidRecord.kind(), "invalid_record");
}
