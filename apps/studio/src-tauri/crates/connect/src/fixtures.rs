//! Runs the shared fixtures in `fixtures/` through this crate. The TypeScript
//! side checks the same files against the spec in `spec/`
//! (`apps/studio/src/connect/protocol.test.ts`).

use std::fs;
use std::path::PathBuf;

use serde_json::Value;

use crate::connect_result::ConnectResult;
use crate::hello::{NotHalonic, read_hello};

/// The fixture files of one message, as `(file name, text)`, sorted by name.
fn fixtures(message: &str, group: &str) -> Vec<(String, String)> {
    let folder = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures")
        .join(message)
        .join(group);
    let mut files: Vec<(String, String)> = fs::read_dir(&folder)
        .unwrap_or_else(|error| panic!("{}: {error}", folder.display()))
        .map(|entry| {
            let path = entry.expect("a fixture entry").path();
            let name = path.file_name().expect("a file name").to_string_lossy();
            (
                name.into_owned(),
                fs::read_to_string(&path).expect("a UTF-8 fixture"),
            )
        })
        .collect();
    files.sort();
    files
}

#[test]
fn hello_answer_fixtures_are_read_as_halonic() {
    let files = fixtures("hello-answer", "valid");
    assert!(!files.is_empty());
    for (name, text) in files {
        assert!(read_hello(200, &text).is_ok(), "{name}");
    }
}

#[test]
fn hello_answer_fixtures_are_not_halonic_when_invalid() {
    let files = fixtures("hello-answer", "invalid");
    assert!(!files.is_empty());
    for (name, text) in files {
        assert_eq!(read_hello(200, &text), Err(NotHalonic), "{name}");
    }
}

/// The valid fixture each result is shown by. The `match` has no wildcard, so
/// a new `ConnectResult` variant doesn't compile until it is named here, and
/// the test below then fails until its fixture exists.
fn fixture_name(result: &ConnectResult) -> &'static str {
    match result {
        ConnectResult::Connected { .. } => "connected.json",
        ConnectResult::NotAnAddress => "not-an-address.json",
        ConnectResult::NotHomeNetwork => "not-home-network.json",
        ConnectResult::NotAnswering { .. } => "not-answering.json",
        ConnectResult::NotHalonic { .. } => "not-halonic.json",
        ConnectResult::AppTooOld { .. } => "app-too-old.json",
        ConnectResult::ComputerTooOld { .. } => "computer-too-old.json",
    }
}

#[test]
fn connect_result_fixtures_match_what_the_crate_serialises() {
    let text = |value: &str| value.to_owned();
    let results = [
        ConnectResult::Connected {
            url: text("http://192.168.1.20:4280/"),
        },
        ConnectResult::NotAnAddress,
        ConnectResult::NotHomeNetwork,
        ConnectResult::NotAnswering {
            address: text("192.168.1.20:4280"),
        },
        ConnectResult::NotHalonic {
            address: text("192.168.1.20:4280"),
        },
        ConnectResult::AppTooOld {
            computer_version: text("0.3.1"),
        },
        ConnectResult::ComputerTooOld {
            computer_version: text("0.1.0"),
        },
    ];
    let files = fixtures("connect-result", "valid");
    let mut names: Vec<&str> = results.iter().map(fixture_name).collect();
    names.sort_unstable();
    let file_names: Vec<&str> = files.iter().map(|(name, _)| name.as_str()).collect();
    assert_eq!(names, file_names, "one valid fixture per result");
    for result in &results {
        let name = fixture_name(result);
        let (_, fixture) = files
            .iter()
            .find(|(file, _)| file == name)
            .expect("a fixture");
        let expected: Value = serde_json::from_str(fixture).expect("a JSON fixture");
        assert_eq!(
            serde_json::to_value(result).expect("serialisable"),
            expected,
            "{name}"
        );
    }
}
