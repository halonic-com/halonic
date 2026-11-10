//! A scratch folder per test, removed when the test ends, a computer with
//! fixed answers, and log lines to append.

// Each test file is its own crate and uses only part of this module.
#![allow(dead_code)]

use std::path::{Path, PathBuf};

use halonic_run_store::{AppendOutcome, RunFolders, RunStoreError, ThisComputer};

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

/// Run folders as one shell or CLI process has them. Two of them on one
/// folder stand for two processes: they share no turns, only the lock.
pub fn folders() -> RunFolders<FakeComputer> {
    RunFolders::new(FakeComputer)
}

/// A folder of its own for one test, under the system's temporary folder.
pub struct Scratch(PathBuf);

impl Scratch {
    /// A fresh, empty folder named after the test.
    pub fn new(name: &str) -> Self {
        let folder = std::env::temp_dir().join(format!("run-store-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the scratch folder can be created");
        Self(folder)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    /// The run folder inside, which doesn't exist yet.
    pub fn runs(&self) -> PathBuf {
        self.0.join("runs")
    }

    /// The file `name` in the run folder.
    pub fn file(&self, name: &str) -> PathBuf {
        self.runs().join(name)
    }

    /// Writes `bytes` to the file `name` in the run folder, creating it.
    pub fn plant(&self, name: &str, bytes: impl AsRef<[u8]>) {
        std::fs::create_dir_all(self.runs()).expect("the run folder can be created");
        std::fs::write(self.file(name), bytes).expect("the file can be planted");
    }

    /// The names in the run folder, sorted.
    pub fn names(&self) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(self.runs())
            .expect("the run folder can be listed")
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
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// The log lines of events `from` to `to` of `run_id`, as the page's
/// `formatLogLines` writes them.
pub fn lines(run_id: &str, from: u64, to: u64) -> String {
    (from..=to)
        .map(|seq| format!("{{\"runId\":\"{run_id}\",\"seq\":{seq},\"type\":\"state.entered\"}}\n"))
        .collect()
}

/// What an append that stored its lines and wrote any snapshot gives.
pub fn appended(last_seq: u64) -> Result<AppendOutcome, RunStoreError> {
    Ok(AppendOutcome::Appended {
        last_seq,
        snapshot_error: None,
        release_error: None,
    })
}
