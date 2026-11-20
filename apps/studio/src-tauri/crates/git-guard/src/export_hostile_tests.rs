//! Export tests that need a hostile tree or a stalled fetch, kept apart from
//! `export_tests.rs` to stay under the file-size limit. They share its helpers.

#![allow(
    clippy::disallowed_methods,
    reason = "a test's programs share its console"
)]

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

use super::{
    Scratch, address_of, entries_of, git_program, local_ssh, plain_git, posix, runner, running_ssh,
    server,
};
use crate::error::GitError;
use crate::export::ExportLimits;

/// A commit whose top folder holds a `.git` and a `.GIT`, a `..` entry and
/// a link out of the folder, made with the object commands because git's
/// own `add` refuses them.
fn hostile_server(root: &Path) -> PathBuf {
    let server = root.join("hostile");
    std::fs::create_dir_all(&server).expect("the folder is created");
    plain_git(&server, &["init", "-q", "--bare"]);
    let blob = |text: &str| {
        let file = root.join("blob.txt");
        std::fs::write(&file, text).expect("the file writes");
        plain_git(&server, &["hash-object", "-w", &posix(&file)])
    };
    let hook = blob("[core]\n\tfsmonitor = touch hacked\n");
    let link = blob("../../outside");
    let mut listing = String::new();
    for (mode, id, name) in [
        ("100644", &hook, ".git"),
        ("100644", &hook, ".GIT"),
        ("100644", &hook, ".."),
        ("120000", &link, "escape"),
    ] {
        listing.push_str(&format!("{mode} blob {id}\t{name}\n"));
    }
    let list = root.join("tree.txt");
    std::fs::write(&list, listing).expect("the listing writes");
    let tree = plain_git_with_input(&server, &["mktree"], &list);
    let commit = plain_git(&server, &["commit-tree", "-m", "hostile", &tree]);
    plain_git(&server, &["update-ref", "HEAD", &commit]);
    plain_git(&server, &["symbolic-ref", "HEAD", "refs/heads/main"]);
    plain_git(&server, &["update-ref", "refs/heads/main", &commit]);
    server
}

/// `plain_git` with the file `input` on its standard input.
fn plain_git_with_input(folder: &Path, args: &[&str], input: &Path) -> String {
    let mut command = Command::new(git_program());
    let output = command
        .current_dir(folder)
        .args(args)
        .stdin(std::fs::File::open(input).expect("the input opens"))
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_owned()
}

#[test]
fn git_export_refuses_a_hostile_tree_and_leaves_nothing_behind() {
    let scratch = Scratch::new("hostile");
    let root = &scratch.0;
    let server = hostile_server(root);
    let ssh = running_ssh(root);
    let parent = root.join("exports");
    let outside = root.join("outside");
    let result = runner(root).export_with(
        &address_of(&server),
        None,
        &parent,
        ExportLimits::default(),
        &AtomicBool::new(false),
        Some(&ssh),
    );
    let error = result.expect_err("a tree with a .git in it is refused");
    assert!(matches!(error, GitError::ExportFailed { .. }), "{error:?}");
    assert_eq!(
        entries_of(&parent),
        Vec::<String>::new(),
        "a folder was left"
    );
    assert!(!outside.exists(), "a link led out of the export");
    assert!(!root.join("hacked").exists(), "a hook-like file ran");
}

#[test]
fn git_export_stops_a_fetch_that_passes_the_cap_while_git_runs() {
    let scratch = Scratch::new("cap-mid-fetch");
    let root = &scratch.0;
    let server = server(root);
    // An ssh that puts 64 KiB into the export's repository, then never answers.
    let ssh = local_ssh(root, "head -c 65536 /dev/zero > repository/junk\nsleep 60");
    let parent = root.join("exports");
    let limits = ExportLimits {
        max_fetch_bytes: 1024,
        ..ExportLimits::default()
    };
    let begun = Instant::now();
    let error = runner(root)
        .export_with(
            &address_of(&server),
            Some("v1"),
            &parent,
            limits,
            &AtomicBool::new(false),
            Some(&ssh),
        )
        .expect_err("the fetch is over the cap");
    assert_eq!(error, GitError::ExportTooLarge);
    assert!(
        begun.elapsed() < Duration::from_secs(30),
        "the cap didn't stop git"
    );
    assert_eq!(
        entries_of(&parent),
        Vec::<String>::new(),
        "a folder was left"
    );
}
