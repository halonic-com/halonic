//! A scratch folder per test, removed when the test ends, and the port's
//! golden cases.

// Each test file is its own crate and uses only part of this module.
#![allow(dead_code)]

use std::path::{Path, PathBuf};

use halonic_host_settings::FileHostSettingsStore;
use serde_json::Value;

/// The limits and saved shapes every adapter agrees on, shared with the
/// TypeScript contract suite.
const GOLDEN: &str = include_str!(
    "../../../../../../../packages/testing/contracts/src/golden/host-settings-limits.json"
);

/// The golden cases, parsed.
pub fn golden() -> Value {
    serde_json::from_str(GOLDEN).expect("the golden cases are JSON")
}

/// A folder of its own for one test, under the system's temporary folder.
pub struct Scratch(PathBuf);

impl Scratch {
    /// A fresh, empty folder named after the test.
    pub fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("host-settings-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the scratch folder can be created");
        Self(folder)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    /// The `settings` folder inside, which doesn't exist yet.
    pub fn settings(&self) -> PathBuf {
        self.0.join("settings")
    }

    /// `host.json` in the settings folder.
    pub fn file(&self) -> PathBuf {
        self.settings().join("host.json")
    }

    /// A store over the settings folder.
    pub fn store(&self) -> FileHostSettingsStore {
        FileHostSettingsStore::new(self.settings())
    }

    /// Writes `text` as `host.json`, creating the folder.
    pub fn write_saved(&self, text: &str) {
        std::fs::create_dir_all(self.settings()).expect("the folder can be created");
        std::fs::write(self.file(), text).expect("the file can be written");
    }

    /// `host.json` parsed, as the TypeScript side would read it.
    pub fn saved(&self) -> Value {
        let text = std::fs::read_to_string(self.file()).expect("host.json is there");
        serde_json::from_str(&text).expect("host.json is JSON")
    }

    /// The names in the settings folder, sorted.
    pub fn names(&self) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(self.settings())
            .expect("the folder is there")
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
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
