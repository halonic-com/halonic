//! The run folder's files are private to the user and never followed
//! through a link, as `fs-node` keeps them. Requirement
//! `run-store-private-files`.
#![cfg(unix)]

mod support;

use std::fs;
use std::os::unix::fs::{PermissionsExt, symlink};
use std::path::Path;

use halonic_run_store::RunStoreError;
use support::{Scratch, appended, folders, lines};

fn mode_of(path: &Path) -> u32 {
    fs::metadata(path)
        .expect("the entry is there")
        .permissions()
        .mode()
        & 0o777
}

fn linked_log() -> RunStoreError {
    RunStoreError::LinkedLog {
        file: "r1.jsonl".to_owned(),
    }
}

#[test]
fn run_store_private_files_are_made_with_mode_600_in_a_folder_with_mode_700() {
    let scratch = Scratch::new("private-modes");
    let folders = folders();
    let runs = folders.folder(&scratch.runs()).unwrap();
    assert_eq!(
        runs.append("r1", 0, &lines("r1", 1, 1), Some("{}")),
        appended(1)
    );
    assert_eq!(mode_of(&scratch.runs()), 0o700);
    assert_eq!(mode_of(&scratch.file("r1.jsonl")), 0o600);
    assert_eq!(mode_of(&scratch.file("r1.snapshot.json")), 0o600);
}

#[test]
fn run_store_private_files_make_a_folder_made_earlier_private() {
    let scratch = Scratch::new("private-folder");
    fs::create_dir_all(scratch.runs()).unwrap();
    fs::set_permissions(scratch.runs(), fs::Permissions::from_mode(0o755)).unwrap();
    let folders = folders();
    let runs = folders.folder(&scratch.runs()).unwrap();
    runs.append("r1", 0, &lines("r1", 1, 1), None).unwrap();
    assert_eq!(mode_of(&scratch.runs()), 0o700);
}

#[test]
fn run_store_private_files_refuse_a_log_that_is_a_symbolic_link() {
    let scratch = Scratch::new("private-symlink");
    let outside = scratch.path().join("outside.jsonl");
    fs::write(&outside, lines("r1", 1, 1)).unwrap();
    fs::create_dir_all(scratch.runs()).unwrap();
    symlink(&outside, scratch.file("r1.jsonl")).unwrap();
    let folders = folders();
    let runs = folders.folder(&scratch.runs()).unwrap();
    assert_eq!(runs.events("r1"), Err(linked_log()));
    assert_eq!(
        runs.append("r1", 1, &lines("r1", 2, 2), None),
        Err(linked_log())
    );
    assert_eq!(linked_log().kind(), "broken_log");
    assert_eq!(fs::read_to_string(&outside).unwrap(), lines("r1", 1, 1));
}

#[test]
fn run_store_private_files_refuse_a_dangling_link_without_creating_its_target() {
    let scratch = Scratch::new("private-dangling");
    let outside = scratch.path().join("planted.jsonl");
    fs::create_dir_all(scratch.runs()).unwrap();
    symlink(&outside, scratch.file("r1.jsonl")).unwrap();
    let folders = folders();
    let runs = folders.folder(&scratch.runs()).unwrap();
    assert_eq!(
        runs.append("r1", 0, &lines("r1", 1, 1), None),
        Err(linked_log())
    );
    assert!(!outside.exists());
}

#[test]
fn run_store_private_files_refuse_a_log_that_is_a_hard_link() {
    let scratch = Scratch::new("private-hardlink");
    let outside = scratch.path().join("outside.jsonl");
    fs::write(&outside, lines("r1", 1, 1)).unwrap();
    fs::create_dir_all(scratch.runs()).unwrap();
    fs::hard_link(&outside, scratch.file("r1.jsonl")).unwrap();
    let folders = folders();
    let runs = folders.folder(&scratch.runs()).unwrap();
    assert_eq!(runs.events("r1"), Err(linked_log()));
    assert_eq!(
        runs.append("r1", 1, &lines("r1", 2, 2), None),
        Err(linked_log())
    );
    assert_eq!(fs::read_to_string(&outside).unwrap(), lines("r1", 1, 1));
}

#[test]
fn run_store_private_files_ignore_a_snapshot_that_is_a_link() {
    let scratch = Scratch::new("private-snapshot");
    let folders = folders();
    let runs = folders.folder(&scratch.runs()).unwrap();
    runs.append("r1", 0, &lines("r1", 1, 1), None).unwrap();
    let outside = scratch.path().join("outside.snapshot.json");
    fs::write(&outside, "{\"state\":\"planted\"}").unwrap();
    symlink(&outside, scratch.file("r1.snapshot.json")).unwrap();
    assert_eq!(runs.snapshot("r1"), Ok(None));
}
