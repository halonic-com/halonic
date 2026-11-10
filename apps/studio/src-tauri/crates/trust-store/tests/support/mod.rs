//! A scratch folder per test, removed when the test ends, and records to
//! grant.

// Each test file is its own crate and uses only part of this module.
#![allow(dead_code)]

use std::path::{Path, PathBuf};

use halonic_sha256::sha256;
use halonic_trust_store::FileTrustStore;
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

/// The file the store keeps the record for `location` in: the SHA-256 of
/// its UTF-16 code units, worked out here on its own, as `fs-node` does.
pub fn file_for(scratch: &Scratch, location: &str) -> PathBuf {
    let utf16le: Vec<u8> = location.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let name = format!("{}.json", sha256(&utf16le).to_hex());
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

/// The locations of a list of records, in order.
pub fn locations(records: &[Value]) -> Vec<&str> {
    records
        .iter()
        .filter_map(|record| record["location"].as_str())
        .collect()
}
