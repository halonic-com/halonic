//! A scratch folder per test, removed when the test ends, a computer with
//! fixed answers, and change lines to append.

// Each test file is its own crate and uses only part of this module.
#![allow(dead_code)]

use std::path::{Path, PathBuf};

use halonic_record_store::{CollectionLines, RecordFolders, ThisComputer};

pub const THIS_HOST: &str = "this-computer";

/// A computer named [`THIS_HOST`] on which only the test's own process runs.
#[derive(Debug)]
pub struct FakeComputer;

impl ThisComputer for FakeComputer {
    fn host_name(&self) -> Option<String> {
        Some(THIS_HOST.to_owned())
    }

    fn process_alive(&self, pid: u32) -> bool {
        pid == std::process::id()
    }
}

/// Record folders as one shell or CLI process has them. Two of them on one
/// folder stand for two processes: they share no turns, only the lock.
pub fn folders() -> RecordFolders<FakeComputer> {
    RecordFolders::new(FakeComputer)
}

/// A folder of its own for one test, under the system's temporary folder.
pub struct Scratch(PathBuf);

impl Scratch {
    /// A fresh, empty folder named after the test.
    pub fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("record-store-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the scratch folder can be created");
        Self(folder)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    /// The record folder inside, which doesn't exist yet.
    pub fn records(&self) -> PathBuf {
        self.0.join("records")
    }

    /// Writes `bytes` to the file `name` in the record folder, creating it.
    pub fn plant(&self, name: &str, bytes: impl AsRef<[u8]>) {
        std::fs::create_dir_all(self.records()).expect("the record folder can be created");
        std::fs::write(self.records().join(name), bytes).expect("the file can be planted");
    }

    /// The names in the record folder, sorted.
    pub fn names(&self) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(self.records())
            .expect("the record folder can be listed")
            .map(|entry| {
                entry
                    .expect("the entry can be read")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        names.sort();
        names
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// One change line, as `formatRecordLines` writes it.
pub fn change(collection: &str, id: &str) -> String {
    format!(
        "{{\"at\":\"2026-01-01T00:00:00.000Z\",\"collection\":{},\"id\":\"{id}\",\"op\":\"add\",\"values\":{{}}}}\n",
        serde_json::Value::from(collection)
    )
}

/// The lines of `collection` to append.
pub fn lines(collection: &str, text: impl Into<String>) -> CollectionLines {
    CollectionLines {
        collection: collection.to_owned(),
        lines: text.into(),
    }
}
