//! What a hostile workspace, a hand edit or a second writer can do to the
//! folder of records, and how the store must answer: never trust a record it
//! can't read, and never write outside the folder. The cases are on HAL-2820
//! (its `test-cases` document; the ids are in each test). Requirement
//! `trust-files`.

mod support;

use std::fs;
use std::path::Path;

use halonic_trust_store::{FileTrustStore, TrustError};
use support::{Scratch, file_for, grant, locations, node_file_names, record, records_in};

/// The files in a folder, by name.
fn names_in(folder: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(folder)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// Whether a grant left a temporary file behind.
fn has_temporary_file(folder: &Path) -> bool {
    names_in(folder).iter().any(|name| name.ends_with(".tmp"))
}

fn unreadable_naming(location: &str, file: &Path) -> TrustError {
    TrustError::Unreadable {
        location: Some(location.to_owned()),
        file: file.to_owned(),
    }
}

/// P1 to P4: `..`, absolute paths, device names, control characters and a
/// very long location only ever name a hex file inside the folder.
#[test]
fn trust_files_keep_hostile_locations_inside_the_folder() {
    let scratch = Scratch::new("hostile");
    let store = scratch.store();
    let known = node_file_names();
    for (location, _) in &known {
        grant(&store, location, "hfp1:aa");
    }
    let long = format!("/w/{}", "a".repeat(32_000));
    grant(&store, &long, "hfp1:aa");

    assert_eq!(names_in(scratch.path()), ["trust"]);
    let trust = scratch.path().join("trust");
    let files = names_in(&trust);
    assert_eq!(files.len(), known.len() + 1);
    assert!(files.iter().all(|name| name.len() == 69), "{files:?}");
    assert_eq!(
        store.get(&long).unwrap().unwrap()["location"],
        long.as_str()
    );

    // `list` reads each location back from the start of its file, so a
    // newline or a NUL in a location must be written escaped.
    let listed = records_in(&store).unwrap();
    let mut expected: Vec<&str> = known
        .iter()
        .map(|(location, _)| location.as_str())
        .collect();
    expected.push(&long);
    expected.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    assert_eq!(locations(&listed), expected);
    let newline = fs::read_to_string(file_for(&scratch, "/w/new\nline")).unwrap();
    assert!(newline.starts_with("{\n  \"location\": \"/w/new\\nline\",\n"));
}

/// D3, D4, D5, D11, D12, X7, X8 and X9: a file that isn't one whole record
/// for its location is never trusted, and a grant still replaces it.
#[test]
fn trust_files_refuse_files_that_are_not_one_whole_record() {
    let scratch = Scratch::new("not-records");
    let store = scratch.store();
    let location = "/workspaces/acme";
    grant(&store, location, "hfp1:aa");
    let file = file_for(&scratch, location);
    let whole = fs::read(&file).unwrap();
    let text = String::from_utf8(whole.clone()).unwrap();

    let deep = format!(
        "{{\"location\":\"{location}\",\"content\":{}{}}}",
        "[".repeat(200),
        "]".repeat(200)
    );
    let mut bad_utf8 = whole.clone();
    let at = text.find("2026-11-10").unwrap();
    bad_utf8[at..at + 2].copy_from_slice(&[0xff, 0xfe]);
    let damaged: Vec<(&str, Vec<u8>)> = vec![
        ("an empty file", Vec::new()),
        ("an array", b"[]".to_vec()),
        ("a string", b"\"x\"".to_vec()),
        ("null", b"null".to_vec()),
        ("a number", b"7".to_vec()),
        ("a number location", b"{\"location\": 7}".to_vec()),
        ("a null location", b"{\"location\": null}".to_vec()),
        (
            "a list location",
            b"{\"location\": [\"/workspaces/acme\"]}".to_vec(),
        ),
        (
            "text after the record",
            format!("{text}garbage").into_bytes(),
        ),
        ("two records", format!("{text}{text}").into_bytes()),
        ("a byte-order mark", format!("\u{feff}{text}").into_bytes()),
        (
            "a no-break space first",
            format!("\u{a0}{text}").into_bytes(),
        ),
        (
            "a next-line character first",
            format!("\u{85}{text}").into_bytes(),
        ),
        ("bytes that aren't UTF-8", bad_utf8),
        ("content nested 200 deep", deep.into_bytes()),
    ];
    for (case, bytes) in damaged {
        fs::write(&file, &bytes).unwrap();
        assert_eq!(
            store.get(location),
            Err(unreadable_naming(location, &file)),
            "get: {case}"
        );
        match store.list() {
            Err(error) => assert_eq!(error.kind(), "unreadable", "list: {case}"),
            Ok(listing) => panic!("list: {case} was read as {listing:?}"),
        }
        grant(&store, location, "hfp1:bb");
        assert_eq!(store.get(location), Ok(Some(record(location, "hfp1:bb"))));
    }
}

/// D13 and C4: a folder where the record should be is refused, and a grant
/// that can't replace it fails without leaving its temporary file.
#[test]
fn trust_files_refuse_a_folder_where_a_record_should_be() {
    let scratch = Scratch::new("folder-record");
    let store = scratch.store();
    let location = "/workspaces/acme";
    let file = file_for(&scratch, location);
    fs::create_dir_all(&file).unwrap();

    assert_eq!(store.get(location), Err(unreadable_naming(location, &file)));
    assert_eq!(
        store.list(),
        Err(TrustError::Unreadable {
            location: None,
            file: file.clone(),
        })
    );
    let refused = store.grant(&record(location, "hfp1:aa")).unwrap_err();
    assert_eq!(refused.kind(), "io");
    assert!(file.is_dir());
    assert!(!has_temporary_file(&scratch.path().join("trust")));
}

/// C3: the temporary file a crashed `fs-node` grant leaves behind is named
/// differently from the shell's, and is left alone too.
#[test]
fn trust_files_leave_a_temporary_file_fs_node_left_behind() {
    let scratch = Scratch::new("node-leftover");
    let store = scratch.store();
    grant(&store, "/workspaces/acme", "hfp1:aa");
    let leftover = file_for(&scratch, "/workspaces/zeta")
        .with_extension("json.0b5c4f3e-8d2a-4c1e-9f6b-7a3d2e1c0b9a.tmp");
    fs::write(&leftover, "{\n  \"location\": \"/workspaces/zeta\"").unwrap();

    assert_eq!(
        locations(&records_in(&store).unwrap()),
        ["/workspaces/acme"]
    );
    assert_eq!(store.get("/workspaces/zeta"), Ok(None));
    assert!(leftover.is_file());
}

/// X10: a profile path that runs through a file trusts nothing, and a grant
/// there fails. The answer differs by system (none or unreadable), so only
/// "not trusted" is pinned.
#[test]
fn trust_files_trust_nothing_under_a_profile_that_is_a_file() {
    let scratch = Scratch::new("profile-file");
    let profile = scratch.path().join("profile");
    fs::write(&profile, "not a folder").unwrap();
    let store = FileTrustStore::new(profile.join("trust"));

    assert!(!matches!(store.get("/workspaces/acme"), Ok(Some(_))));
    assert!(
        store
            .list()
            .map_or(true, |listing| listing.records.is_empty())
    );
    let refused = store
        .grant(&record("/workspaces/acme", "hfp1:aa"))
        .unwrap_err();
    assert_eq!(refused.kind(), "io");
    assert_eq!(fs::read_to_string(&profile).unwrap(), "not a folder");
}

/// M3: every folder a grant creates, the profile too, is its owner's only.
#[cfg(unix)]
#[test]
fn trust_files_make_every_folder_they_create_owner_only() {
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;

    let scratch = Scratch::new("parents");
    let profile = scratch.path().join("profile");
    FileTrustStore::new(profile.join("trust"))
        .grant(&record("/workspaces/acme", "hfp1:aa"))
        .unwrap();
    let mode = |path: PathBuf| fs::metadata(path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode(profile.clone()), 0o700);
    assert_eq!(mode(profile.join("trust")), 0o700);
}

/// C1, C2, C7 and P8: two writers granting one location while a third
/// grants and revokes another. Every read in between is a whole record or
/// none, `list` never trips over a temporary or just-deleted file, and no
/// temporary file is left. Unix only: Windows rename semantics are C6, which
/// still needs its own case.
#[cfg(unix)]
#[test]
fn trust_files_stay_whole_while_others_write() {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::thread;

    use serde_json::Value;

    const ROUNDS: usize = 100;
    let scratch = Scratch::new("writers");
    let store = scratch.store();
    let done = Arc::new(AtomicBool::new(false));
    let writer = |prefix: &'static str| {
        let store = store.clone();
        thread::spawn(move || {
            for round in 0..ROUNDS {
                grant(&store, "/workspaces/acme", &format!("hfp1:{prefix}{round}"));
            }
        })
    };
    let writers = [writer("a"), writer("b")];
    let churn = {
        let store = store.clone();
        let done = Arc::clone(&done);
        thread::spawn(move || {
            while !done.load(Ordering::Relaxed) {
                grant(&store, "/workspaces/zeta", "hfp1:zz");
                store.revoke("/workspaces/zeta").unwrap();
            }
        })
    };

    let whole = |found: &Value| {
        let fingerprint = found["fingerprint"].as_str().unwrap().to_owned();
        let location = found["location"].as_str().unwrap();
        assert_eq!(found, &record(location, &fingerprint));
    };
    while writers.iter().any(|writer| !writer.is_finished()) {
        if let Some(found) = store.get("/workspaces/acme").unwrap() {
            whole(&found);
        }
        for found in records_in(&store).unwrap() {
            whole(&found);
        }
    }
    done.store(true, Ordering::Relaxed);
    for handle in writers.into_iter().chain([churn]) {
        handle.join().unwrap();
    }

    // The last write is one writer's last round.
    let last = store.get("/workspaces/acme").unwrap().unwrap();
    let last_round = (ROUNDS - 1).to_string();
    assert!(last["fingerprint"].as_str().unwrap().ends_with(&last_round));
    assert!(!has_temporary_file(&scratch.path().join("trust")));
}
