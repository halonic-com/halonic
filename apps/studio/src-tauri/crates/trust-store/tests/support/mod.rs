//! A scratch folder per test, removed when the test ends, and records to
//! grant.

// Each test file is its own crate and uses only part of this module.
#![allow(dead_code)]

use std::path::{Path, PathBuf};

use halonic_trust_store::{FileTrustStore, TrustError};
use serde_json::{Value, json};

/// A folder of its own for one test, under the system's temporary folder.
pub struct Scratch(PathBuf);

impl Scratch {
    /// A fresh, empty folder named after the test.
    pub fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("trust-store-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the scratch folder can be created");
        Self(folder)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    /// A store over the `trust` folder inside, which doesn't exist yet.
    pub fn store(&self) -> FileTrustStore {
        FileTrustStore::new(self.0.join("trust"))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Every location in `tests/fixtures/file-names.tsv` with the file name
/// `fs-node` gives its record, made with Node's `crypto`.
pub fn node_file_names() -> Vec<(String, String)> {
    let table = include_str!("../fixtures/file-names.tsv");
    table
        .lines()
        .filter(|line| !line.starts_with('#') && !line.is_empty())
        .map(|line| {
            let (location, name) = line.split_once('\t').expect("a tab between the columns");
            let location: String = serde_json::from_str(location).expect("a JSON string");
            (location, name.to_owned())
        })
        .collect()
}

/// The file the store keeps the record for `location` in, as `fs-node`
/// names it. Only locations in the fixture can be looked up.
pub fn file_for(scratch: &Scratch, location: &str) -> PathBuf {
    let (_, name) = node_file_names()
        .into_iter()
        .find(|(known, _)| known == location)
        .expect("the location is in tests/fixtures/file-names.tsv");
    scratch.path().join("trust").join(name)
}

/// A full record for `location`, as `TrustService` writes it; `fingerprint`
/// tells two versions apart.
pub fn record(location: &str, fingerprint: &str) -> Value {
    json!({
        "location": location,
        "fingerprint": fingerprint,
        "content": {
            "programs": [
                { "connector": "mail", "command": "npx", "args": ["-y", "@acme/mail-mcp"] },
            ],
        },
        "grantedAt": "2026-11-10T10:00:00.000Z",
        "appVersion": "0.1.0",
        "pins": {},
        "origin": "prompt",
    })
}

/// Grants the full record for `location`, which must succeed.
pub fn grant(store: &FileTrustStore, location: &str, fingerprint: &str) {
    store
        .grant(&record(location, fingerprint))
        .expect("the record is saved");
}

/// The locations of a list of records, in order.
pub fn locations(records: &[Value]) -> Vec<&str> {
    records
        .iter()
        .filter_map(|record| record["location"].as_str())
        .collect()
}

/// The records `list` gives, after checking that it left no file out.
pub fn records_in(store: &FileTrustStore) -> Result<Vec<Value>, TrustError> {
    store.list().map(|listing| {
        let left_out = &listing.left_out;
        assert!(left_out.is_empty(), "left out: {left_out:?}");
        listing.records
    })
}
