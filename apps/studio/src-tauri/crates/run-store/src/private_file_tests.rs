//! The open itself refuses a link, so one put in place after the check
//! looked can't be followed. Requirement `run-store-private-files`.

use std::fs::{self, OpenOptions};
use std::os::unix::fs::symlink;
use std::path::PathBuf;

use super::{FileRefusal, open_unfollowed};

/// A folder of its own for one test, removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("run-store-unit-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).expect("the scratch folder can be created");
        Self(folder)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn run_store_private_files_create_no_file_through_a_link_put_after_the_check() {
    // The log didn't exist when it was checked; a dangling link took its
    // place before the open that creates it.
    let scratch = Scratch::new("nofollow-create");
    let planted = scratch.0.join("planted.jsonl");
    let log = scratch.0.join("r1.jsonl");
    symlink(&planted, &log).unwrap();
    let opened = open_unfollowed(&log, OpenOptions::new().append(true).create(true));
    assert!(matches!(opened, Err(FileRefusal::Linked)));
    assert!(!planted.exists());
}

#[test]
fn run_store_private_files_open_no_existing_file_through_a_link_put_after_the_check() {
    let scratch = Scratch::new("nofollow-existing");
    let outside = scratch.0.join("outside.jsonl");
    fs::write(&outside, "kept\n").unwrap();
    let log = scratch.0.join("r1.jsonl");
    symlink(&outside, &log).unwrap();
    for options in [
        OpenOptions::new().read(true),
        OpenOptions::new().append(true).create(true),
        OpenOptions::new().write(true),
    ] {
        let opened = open_unfollowed(&log, options);
        assert!(matches!(opened, Err(FileRefusal::Linked)));
    }
    assert_eq!(fs::read_to_string(&outside).unwrap(), "kept\n");
}
