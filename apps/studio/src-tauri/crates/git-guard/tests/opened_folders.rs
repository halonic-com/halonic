//! The opened-folder check, with real folders.

mod support;

use halonic_git_guard::{GitError, OpenedFolders};
use support::{Sandbox, TemporaryFolder, plain_git_ok};

#[test]
fn opened_folders_refuses_everything_until_a_folder_is_opened() {
    let temporary = TemporaryFolder::new();
    let folders = OpenedFolders::new();
    assert_eq!(
        folders.check(temporary.path()),
        Err(GitError::FolderNotOpened)
    );
}

#[test]
fn opened_folders_allows_an_opened_folder_and_its_subfolders() {
    let temporary = TemporaryFolder::new();
    let acme = temporary.folder("acme");
    let notes = temporary.folder("acme/notes");
    let folders = OpenedFolders::new();
    folders.open(&acme).expect("acme opens");
    assert!(folders.check(&acme).is_ok());
    assert!(folders.check(&notes).is_ok());
}

#[test]
fn opened_folders_compares_path_parts_not_text() {
    let temporary = TemporaryFolder::new();
    let acme = temporary.folder("acme");
    let acme_evil = temporary.folder("acme-evil");
    let folders = OpenedFolders::new();
    folders.open(&acme).expect("acme opens");
    assert_eq!(folders.check(&acme_evil), Err(GitError::FolderNotOpened));
    assert_eq!(
        folders.check(&acme.join("..").join("acme-evil")),
        Err(GitError::FolderNotOpened)
    );
    assert_eq!(
        folders.check(&acme.join("..")),
        Err(GitError::FolderNotOpened)
    );
}

#[test]
fn opened_folders_refuses_a_missing_folder() {
    let temporary = TemporaryFolder::new();
    let folders = OpenedFolders::new();
    folders.open(temporary.path()).expect("the folder opens");
    assert_eq!(
        folders.check(&temporary.path().join("missing")),
        Err(GitError::FolderUnreadable)
    );
}

#[cfg(unix)]
#[test]
fn opened_folders_follows_links_before_comparing() {
    let temporary = TemporaryFolder::new();
    let acme = temporary.folder("acme");
    let outside = temporary.folder("outside");
    std::os::unix::fs::symlink(&outside, acme.join("link")).expect("the link is created");
    let folders = OpenedFolders::new();
    folders.open(&acme).expect("acme opens");
    assert_eq!(
        folders.check(&acme.join("link")),
        Err(GitError::FolderNotOpened)
    );
}

#[test]
fn opened_folders_refuses_a_repository_whose_top_is_outside() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    let notes = sandbox.acme.join("notes");
    std::fs::create_dir_all(&notes).expect("notes is created");
    let folders = OpenedFolders::new();
    folders.open(&notes).expect("notes opens");
    let args = vec!["status".to_owned()];
    assert_eq!(
        sandbox.runner.run(&folders, &notes, &args),
        Err(GitError::FolderNotOpened)
    );
}

#[test]
fn opened_folders_refuses_git_in_a_folder_that_was_not_opened() {
    let sandbox = Sandbox::new();
    let elsewhere = sandbox.temporary.folder("elsewhere");
    assert_eq!(
        sandbox.git_in(&elsewhere, "init"),
        Err(GitError::FolderNotOpened)
    );
}

/// A repository outside the opened folder, with one commit.
fn outside_repository(sandbox: &Sandbox) -> std::path::PathBuf {
    let outside = sandbox.temporary.folder("outside");
    plain_git_ok(&outside, &["init", "-q"]);
    std::fs::write(outside.join("secret.md"), "outside\n").expect("the file writes");
    plain_git_ok(&outside, &["add", "secret.md"]);
    plain_git_ok(&outside, &["commit", "-q", "-m", "secret"]);
    outside
}

#[test]
fn opened_folders_refuses_a_git_file_that_points_outside() {
    let sandbox = Sandbox::new();
    let outside = outside_repository(&sandbox);
    let git_dir = outside.join(".git");
    sandbox.write(".git", &format!("gitdir: {}\n", git_dir.display()));
    assert_eq!(sandbox.git("log -p"), Err(GitError::FolderNotOpened));
}

#[test]
fn opened_folders_refuses_a_common_folder_outside() {
    let sandbox = Sandbox::new();
    let outside = outside_repository(&sandbox);
    sandbox.init_repository();
    sandbox.write(
        ".git/commondir",
        &format!("{}\n", outside.join(".git").display()),
    );
    assert_eq!(sandbox.git("log -p"), Err(GitError::FolderNotOpened));
}

#[test]
fn opened_folders_refuses_alternates_outside() {
    let sandbox = Sandbox::new();
    let outside = outside_repository(&sandbox);
    sandbox.init_repository();
    sandbox.write(
        ".git/objects/info/alternates",
        &format!("{}\n", outside.join(".git").join("objects").display()),
    );
    assert_eq!(sandbox.git("status"), Err(GitError::FolderNotOpened));
}

#[test]
fn opened_folders_allows_alternates_inside() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    let shared = sandbox.temporary.folder("acme/shared");
    plain_git_ok(&shared, &["init", "-q"]);
    sandbox.write(
        ".git/objects/info/alternates",
        "../../shared/.git/objects\n",
    );
    sandbox.git_ok("status");
}
