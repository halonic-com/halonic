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

#[test]
fn opened_folders_names_a_missing_alternate() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.write(".git/objects/info/alternates", "../../gone/.git/objects\n");
    let Err(GitError::AlternateMissing { file, alternate }) = sandbox.git("status") else {
        panic!("a missing alternate is not named");
    };
    let expected = std::fs::canonicalize(sandbox.acme.join(".git/objects/info/alternates"))
        .expect("the alternates file exists");
    assert_eq!(file, expected.display().to_string());
    assert!(
        std::path::Path::new(&alternate).ends_with(std::path::Path::new("gone/.git/objects")),
        "{alternate}"
    );
}

#[cfg(unix)]
#[test]
fn opened_folders_refuses_a_nested_repository_whose_git_folder_is_outside() {
    let sandbox = Sandbox::new();
    let outside = outside_repository(&sandbox);
    sandbox.init_repository();
    let vendor = sandbox.temporary.folder("acme/vendor");
    plain_git_ok(&vendor, &["init", "-q"]);
    std::fs::write(vendor.join("lib.md"), "1\n").expect("the file writes");
    plain_git_ok(&vendor, &["add", "lib.md"]);
    plain_git_ok(&vendor, &["commit", "-q", "-m", "lib"]);
    sandbox.git_ok("add -A");
    // Once it is a gitlink, its `.git` is swapped for one that points out.
    std::fs::remove_dir_all(vendor.join(".git")).expect("the git folder is removed");
    std::fs::write(
        vendor.join(".git"),
        format!("gitdir: {}\n", outside.join(".git").display()),
    )
    .expect("the git file writes");
    assert_eq!(sandbox.git("status"), Err(GitError::FolderNotOpened));
}

/// A folder `path` in `acme`, not added, whose `.git` file points at
/// [`outside_repository`].
#[cfg(unix)]
fn untracked_link_to_outside(sandbox: &Sandbox, path: &str) {
    let outside = outside_repository(sandbox);
    let folder = sandbox.temporary.folder(&format!("acme/{path}"));
    std::fs::write(
        folder.join(".git"),
        format!("gitdir: {}\n", outside.join(".git").display()),
    )
    .expect("the git file writes");
}

/// Whether plain git's index in `acme` holds a gitlink: `add` read the
/// outside repository's `HEAD` to record it.
#[cfg(unix)]
fn plain_git_recorded_a_gitlink(sandbox: &Sandbox) -> bool {
    let output = support::plain_git(&sandbox.acme, &["ls-files", "--stage"]);
    String::from_utf8_lossy(&output.stdout).contains("160000 ")
}

#[cfg(unix)]
#[test]
fn opened_folders_refuses_an_untracked_nested_repository_whose_git_folder_is_outside() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    // Inside a folder that isn't tracked either, where git still finds it.
    untracked_link_to_outside(&sandbox, "lib/vendor");
    assert_eq!(sandbox.git("add -A"), Err(GitError::FolderNotOpened));
    assert_eq!(sandbox.git("status"), Err(GitError::FolderNotOpened));
    plain_git_ok(&sandbox.acme, &["add", "-A"]);
    assert!(plain_git_recorded_a_gitlink(&sandbox));
}

#[cfg(unix)]
#[test]
fn opened_folders_refuses_an_ignored_nested_repository_only_for_a_forced_add() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.write(".gitignore", "vendor/\n");
    untracked_link_to_outside(&sandbox, "vendor");
    sandbox.git_ok("status");
    sandbox.git_ok("add -A");
    assert_eq!(
        sandbox.git("add -f -- vendor"),
        Err(GitError::FolderNotOpened)
    );
    plain_git_ok(&sandbox.acme, &["add", "-f", "--", "vendor"]);
    assert!(plain_git_recorded_a_gitlink(&sandbox));
}

#[test]
fn opened_folders_allows_an_untracked_nested_repository_inside() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    let vendor = sandbox.temporary.folder("acme/vendor");
    plain_git_ok(&vendor, &["init", "-q"]);
    sandbox.git_ok("status");
}

/// [`outside_repository`] with its objects in one pack and its refs in
/// `packed-refs`.
#[cfg(unix)]
fn packed_outside_repository(sandbox: &Sandbox) -> std::path::PathBuf {
    let outside = outside_repository(sandbox);
    plain_git_ok(&outside, &["repack", "-q", "-a", "-d"]);
    plain_git_ok(&outside, &["pack-refs", "--all"]);
    outside
}

/// Whether plain git, not the runner, shows the outside repository's
/// commit in `acme`.
#[cfg(unix)]
fn plain_git_shows_the_secret(sandbox: &Sandbox) -> bool {
    let output = support::plain_git(&sandbox.acme, &["log", "-p"]);
    String::from_utf8_lossy(&output.stdout).contains("+outside")
}

#[cfg(unix)]
#[test]
fn opened_folders_refuses_objects_and_refs_linked_outside() {
    use std::os::unix::fs::symlink;
    let sandbox = Sandbox::new();
    let outside = outside_repository(&sandbox);
    sandbox.init_repository();
    let git = sandbox.acme.join(".git");
    for name in ["objects", "refs"] {
        std::fs::remove_dir_all(git.join(name)).expect("the folder is removed");
        symlink(outside.join(".git").join(name), git.join(name)).expect("the link is created");
    }
    assert_eq!(sandbox.git("log -p"), Err(GitError::FolderNotOpened));
    assert!(plain_git_shows_the_secret(&sandbox));
}

#[cfg(unix)]
#[test]
fn opened_folders_refuses_a_pack_file_linked_outside() {
    use std::os::unix::fs::symlink;
    let sandbox = Sandbox::new();
    let outside = packed_outside_repository(&sandbox);
    sandbox.init_repository();
    let git = sandbox.acme.join(".git");
    let packs = std::fs::read_dir(outside.join(".git/objects/pack")).expect("pack reads");
    for pack in packs {
        let pack = pack.expect("the entry reads").path();
        let name = pack.file_name().expect("the pack has a name");
        symlink(&pack, git.join("objects/pack").join(name)).expect("the link is created");
    }
    symlink(outside.join(".git/packed-refs"), git.join("packed-refs"))
        .expect("the link is created");
    assert_eq!(sandbox.git("log -p"), Err(GitError::FolderNotOpened));
    assert!(plain_git_shows_the_secret(&sandbox));
}

#[cfg(unix)]
#[test]
fn opened_folders_refuses_a_link_in_an_alternate_that_leads_outside() {
    use std::os::unix::fs::symlink;
    let sandbox = Sandbox::new();
    let outside = packed_outside_repository(&sandbox);
    sandbox.init_repository();
    let shared = sandbox.temporary.folder("acme/shared");
    plain_git_ok(&shared, &["init", "-q"]);
    let packs = shared.join(".git/objects/pack");
    std::fs::remove_dir_all(&packs).expect("pack is removed");
    symlink(outside.join(".git/objects/pack"), &packs).expect("the link is created");
    sandbox.write(
        ".git/objects/info/alternates",
        "../../shared/.git/objects\n",
    );
    assert_eq!(sandbox.git("status"), Err(GitError::FolderNotOpened));
}

#[cfg(unix)]
#[test]
fn opened_folders_refuses_a_log_folder_linked_outside() {
    use std::os::unix::fs::symlink;
    let sandbox = Sandbox::new();
    let outside = outside_repository(&sandbox);
    sandbox.init_repository();
    sandbox.write("notes.md", "1\n");
    plain_git_ok(&sandbox.acme, &["add", "notes.md"]);
    plain_git_ok(&sandbox.acme, &["commit", "-q", "-m", "notes"]);
    let logs = sandbox.acme.join(".git/logs/refs");
    std::fs::remove_dir_all(&logs).expect("the folder is removed");
    symlink(outside.join(".git/logs/refs"), &logs).expect("the link is created");
    let written = outside.join(".git/logs/refs/heads/x");
    assert_eq!(sandbox.git("branch x"), Err(GitError::FolderNotOpened));
    assert!(!written.exists());
    // Plain git writes the new branch's log in the other repository.
    plain_git_ok(&sandbox.acme, &["branch", "x"]);
    assert!(written.exists());
}

#[cfg(unix)]
#[test]
fn opened_folders_allows_links_in_the_git_folder_that_stay_inside() {
    use std::os::unix::fs::symlink;
    // The way `git-new-workdir` and `repo` share one repository's objects
    // and refs.
    let sandbox = Sandbox::new();
    let shared = sandbox.temporary.folder("acme/shared");
    plain_git_ok(&shared, &["init", "-q"]);
    std::fs::write(shared.join("notes.md"), "shared\n").expect("the file writes");
    plain_git_ok(&shared, &["add", "notes.md"]);
    plain_git_ok(&shared, &["commit", "-q", "-m", "shared"]);
    let work = sandbox.temporary.folder("acme/work");
    plain_git_ok(&work, &["init", "-q"]);
    for name in ["objects", "refs"] {
        let linked = work.join(".git").join(name);
        std::fs::remove_dir_all(&linked).expect("the folder is removed");
        symlink(shared.join(".git").join(name), &linked).expect("the link is created");
    }
    let log = sandbox.git_ok_in(&work, "log --format=%s");
    assert_eq!(log, "shared\n");
}

#[cfg(unix)]
#[test]
fn opened_folders_opens_a_checked_path_even_if_a_link_is_swapped_in() {
    let temporary = TemporaryFolder::new();
    let acme = temporary.folder("acme");
    let home = temporary.folder("home");
    let checked = std::fs::canonicalize(&acme).expect("acme canonicalises");

    // Between the check and the opening, acme becomes a link to home.
    std::fs::remove_dir(&acme).expect("acme is removed");
    std::os::unix::fs::symlink(&home, &acme).expect("the link is made");
    let folders = OpenedFolders::new();
    folders.open_canonical(checked);

    assert_eq!(folders.check(&home), Err(GitError::FolderNotOpened));
    assert_eq!(folders.check(&acme), Err(GitError::FolderNotOpened));
}
