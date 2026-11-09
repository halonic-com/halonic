use std::os::unix::fs::symlink;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use super::Links;
use crate::error::GitError;
use crate::opened_folders::OpenedFolders;

/// A git folder `acme/.git` under the system's temporary folder, with
/// `acme` opened, removed when dropped.
struct Scratch {
    root: PathBuf,
    git: PathBuf,
    folders: OpenedFolders,
}

impl Scratch {
    fn new(name: &str) -> Self {
        let root = std::env::temp_dir().join(format!("git-guard-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("acme/.git/objects/pack")).expect("objects is created");
        std::fs::create_dir_all(root.join("acme/.git/refs/heads")).expect("refs is created");
        std::fs::create_dir_all(root.join("outside")).expect("outside is created");
        let root = std::fs::canonicalize(&root).expect("the folder resolves");
        let folders = OpenedFolders::new();
        folders.open(&root.join("acme")).expect("acme opens");
        Self {
            git: root.join("acme/.git"),
            root,
            folders,
        }
    }

    fn check(&self, deadline: Instant) -> Result<(), GitError> {
        Links::new(&self.folders, deadline).check_git_folder(&self.git)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn later() -> Instant {
    Instant::now() + Duration::from_secs(60)
}

#[test]
fn opened_folders_refuses_a_link_deep_under_refs_that_leads_outside() {
    let scratch = Scratch::new("links-deep");
    let deep = scratch.git.join("refs/remotes/origin/team");
    std::fs::create_dir_all(&deep).expect("the folder is created");
    symlink(scratch.root.join("outside"), deep.join("topic")).expect("the link is created");
    assert_eq!(scratch.check(later()), Err(GitError::FolderNotOpened));
}

#[test]
fn opened_folders_refuses_a_link_that_leads_nowhere() {
    let scratch = Scratch::new("links-dangling");
    symlink(
        scratch.root.join("outside/not-yet"),
        scratch.git.join("objects/pack/pack-1.pack"),
    )
    .expect("the link is created");
    assert_eq!(scratch.check(later()), Err(GitError::FolderUnreadable));
}

#[test]
fn opened_folders_ends_a_link_loop_inside_the_opened_folder() {
    let scratch = Scratch::new("links-loop");
    symlink(&scratch.git, scratch.git.join("refs/heads/loop")).expect("the link is created");
    symlink(scratch.git.join("refs"), scratch.git.join("objects/back"))
        .expect("the link is created");
    assert_eq!(scratch.check(later()), Ok(()));
}

#[test]
fn opened_folders_follows_a_link_inside_and_checks_what_it_leads_to() {
    let scratch = Scratch::new("links-chain");
    let shared = scratch.root.join("acme/shared-objects");
    std::fs::create_dir_all(&shared).expect("the folder is created");
    symlink(scratch.root.join("outside"), shared.join("pack")).expect("the link is created");
    std::fs::remove_dir_all(scratch.git.join("objects")).expect("objects is removed");
    symlink(&shared, scratch.git.join("objects")).expect("the link is created");
    assert_eq!(scratch.check(later()), Err(GitError::FolderNotOpened));
}

#[test]
fn opened_folders_stops_the_walk_at_the_time_limit() {
    let scratch = Scratch::new("links-deadline");
    for index in 0..300 {
        std::fs::write(scratch.git.join(format!("refs/heads/topic-{index}")), "")
            .expect("the ref writes");
    }
    assert_eq!(scratch.check(Instant::now()), Err(GitError::TimedOut));
}
