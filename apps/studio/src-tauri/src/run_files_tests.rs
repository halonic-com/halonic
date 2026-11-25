//! Requirement `run-file-save`: what `run_file_save` writes, and when it
//! writes nothing.

use std::cell::Cell;
use std::path::{Path, PathBuf};

use halonic_blob_store::BlobFolder;
use serde_json::json;

use super::{SaveAnswer, save_file, suggested_name};

/// A scratch folder for one test, removed when it ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("run-file-save-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the scratch folder can be created");
        Self(folder)
    }

    fn path(&self) -> &Path {
        &self.0
    }

    fn blobs(&self) -> BlobFolder {
        BlobFolder::new(&self.0.join("blobs")).expect("the blob folder")
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// The Weekly report's file, with a line break and bytes that aren't ASCII.
const REPORT: &[u8] = b"# Weekly report\r\n\nThis week: 12 emails \xe2\x80\x94 3 refunds.\n";

/// A run log that saved `weekly-report.md` as `hash`, as the engine writes it.
fn log_with(hash: &str) -> String {
    let events = [
        json!({"runId": "r1", "seq": 1, "at": "2026-11-24T09:00:00.000Z", "type": "state.entered", "state": "draft"}),
        json!({"runId": "r1", "seq": 2, "at": "2026-11-24T09:01:00.000Z", "type": "artifact.created",
            "state": "draft", "name": "weekly-report.md", "hash": hash, "mediaType": "text/markdown", "size": REPORT.len()}),
    ];
    events.iter().map(|event| format!("{event}\n")).collect()
}

#[test]
fn run_file_save_writes_the_files_exact_bytes_where_the_person_picked() {
    let scratch = Scratch::new("bytes");
    let blobs = scratch.blobs();
    let hash = blobs.put(REPORT).expect("the blob is stored");
    let chosen = scratch.path().join("chosen.md");
    let suggested = Cell::new(String::new());
    let answer = save_file(&log_with(&hash), &blobs, &hash, |name| {
        suggested.set(name.to_owned());
        Some(chosen.clone())
    });
    assert_eq!(answer, Ok(SaveAnswer { saved: true }));
    assert_eq!(std::fs::read(&chosen).expect("the file is written"), REPORT);
    assert_eq!(suggested.take(), "weekly-report.md");
}

#[test]
fn run_file_save_refuses_a_file_the_run_didnt_create_without_a_dialog() {
    let scratch = Scratch::new("unknown");
    let blobs = scratch.blobs();
    let hash = blobs.put(REPORT).expect("the blob is stored");
    // Stored in the workspace, but by another run: this log doesn't name it.
    let other = blobs
        .put(b"another run's file")
        .expect("the blob is stored");
    for asked in [other.as_str(), "0".repeat(64).as_str(), "../secrets", ""] {
        let refusal = save_file(&log_with(&hash), &blobs, asked, |_| {
            panic!("no dialog shows for {asked:?}")
        })
        .expect_err("the run created no such file");
        assert_eq!(refusal.kind, "unknown_artifact", "{asked:?}");
    }
}

#[test]
fn run_file_save_writes_nothing_when_the_dialog_is_cancelled() {
    let scratch = Scratch::new("cancel");
    let blobs = scratch.blobs();
    let hash = blobs.put(REPORT).expect("the blob is stored");
    let before = std::fs::read_dir(scratch.path()).unwrap().count();
    let answer = save_file(&log_with(&hash), &blobs, &hash, |_| None);
    assert_eq!(answer, Ok(SaveAnswer { saved: false }));
    assert_eq!(std::fs::read_dir(scratch.path()).unwrap().count(), before);
    assert_eq!(
        serde_json::to_value(answer.unwrap()).unwrap(),
        json!({"saved": false})
    );
}

#[test]
fn run_file_save_refuses_a_file_whose_bytes_are_gone() {
    let scratch = Scratch::new("missing");
    let hash = "ab".repeat(32);
    let refusal = save_file(&log_with(&hash), &scratch.blobs(), &hash, |_| {
        panic!("no dialog shows without the bytes")
    })
    .expect_err("the blob isn't stored");
    assert_eq!(refusal.kind, "missing_blob");
}

#[test]
fn run_file_save_suggests_only_the_names_last_part_without_hidden_characters() {
    assert_eq!(suggested_name("weekly-report.md"), "weekly-report.md");
    assert_eq!(suggested_name("../../.ssh/config"), "config");
    assert_eq!(suggested_name("out\\notes.md"), "notes.md");
    assert_eq!(suggested_name("report\u{202E}dm.exe"), "reportdm.exe");
    assert_eq!(suggested_name("a\u{200B}b\nc.md"), "abc.md");
    assert_eq!(suggested_name(".."), "file");
    assert_eq!(suggested_name("notes/"), "file");
}
