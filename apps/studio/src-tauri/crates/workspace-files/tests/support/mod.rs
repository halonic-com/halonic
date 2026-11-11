//! A scratch workspace per test, removed when the test ends.

// Each test file is its own crate and uses only part of this module.
#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};

/// A folder of its own for one test, under the system's temporary folder,
/// canonical as the shell's opened folders are.
pub struct Scratch(PathBuf);

impl Scratch {
    /// A fresh, empty folder named after the test.
    pub fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("workspace-files-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).expect("the scratch folder can be created");
        Self(fs::canonicalize(&folder).expect("the scratch folder has a real path"))
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    /// The file or folder at the workspace path `path`.
    pub fn at(&self, path: &str) -> PathBuf {
        let mut native = self.0.clone();
        native.extend(path.split('/'));
        native
    }

    /// Writes `bytes` at the workspace path `path`, creating its folders.
    pub fn put(&self, path: &str, bytes: impl AsRef<[u8]>) {
        let file = self.at(path);
        fs::create_dir_all(file.parent().expect("a file has a folder")).expect("folders made");
        fs::write(file, bytes).expect("the file is written");
    }

    /// The names in the folder at the workspace path `path`, sorted.
    pub fn names_in(&self, path: &str) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(self.at(path))
            .expect("the folder is there")
            .map(|entry| {
                entry
                    .expect("an entry")
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
        let _ = fs::remove_dir_all(&self.0);
    }
}
