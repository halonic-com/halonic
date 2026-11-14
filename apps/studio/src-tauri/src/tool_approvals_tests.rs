//! Requirement `tool-approval-folder`: the folder the `fs_*` commands work
//! in for `"tool-approvals"`. These tests' names start with
//! `tool_approvals_`.

use std::path::PathBuf;

use halonic_git_guard::OpenedFolders;
use halonic_profile::{Platform, ProfileFolder};
use halonic_workspace_files::{WorkspaceFolder, WriteLocks, WriteOutcome};

use super::{check_file, check_list, run, source_root};
use crate::files::{FileFolder, FileRefusal, Making};

/// A folder of its own for one test, removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("studio-approvals-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(folder.join("workspace")).expect("the scratch folder");
        Self(folder)
    }

    fn workspace(&self) -> PathBuf {
        self.0.join("workspace")
    }

    /// A profile beside the workspace; nothing is created in it.
    fn profile(&self) -> ProfileFolder {
        profile_at(self.0.join("profile"))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn profile_at(root: PathBuf) -> ProfileFolder {
    ProfileFolder {
        platform: Platform::current(),
        root: root
            .to_str()
            .expect("a Unicode temporary folder")
            .to_owned(),
    }
}

fn kind_of<T>(answer: Result<T, FileRefusal>) -> Result<(), &'static str> {
    answer.map(|_| ()).map_err(|refusal| refusal.kind)
}

/// The name of an approval file: 64 hex characters and `.json`.
const APPROVAL: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.json";

#[test]
fn tool_approvals_find_the_source_s_folder_of_an_opened_workspace() {
    let scratch = Scratch::new("find");
    let opened = OpenedFolders::new();
    let profile = scratch.profile();

    let refusal = kind_of(source_root(
        &opened,
        &profile,
        &scratch.workspace(),
        Some("notes"),
    ));
    assert_eq!(refusal, Err("folder_not_open"));

    opened.open(&scratch.workspace()).expect("the folder opens");
    let no_source = kind_of(source_root(&opened, &profile, &scratch.workspace(), None));
    assert_eq!(no_source, Err("unsafe_path"));

    let real_path = std::fs::canonicalize(scratch.workspace()).expect("the real path");
    let expected = PathBuf::from(
        profile.tool_approval_source_folder(real_path.to_str().expect("Unicode"), "notes"),
    );
    let root = source_root(&opened, &profile, &scratch.workspace(), Some("notes"));
    assert_eq!(root, Ok(expected.clone()));
    assert!(expected.starts_with(scratch.0.join("profile").join("tool-approvals")));
    assert_ne!(
        root,
        source_root(&opened, &profile, &scratch.workspace(), Some("docs")),
        "each source has a folder of its own"
    );
    assert!(!expected.exists(), "finding the folder makes nothing");
}

#[test]
fn tool_approvals_refuse_a_folder_inside_the_workspace() {
    let scratch = Scratch::new("inside");
    let opened = OpenedFolders::new();
    opened.open(&scratch.workspace()).expect("the folder opens");
    let inside = profile_at(scratch.workspace().join("profile"));

    let refusal = kind_of(source_root(
        &opened,
        &inside,
        &scratch.workspace(),
        Some("notes"),
    ));
    assert_eq!(refusal, Err("private_path"));
}

#[test]
fn tool_approvals_work_only_on_the_store_s_own_files() {
    let folder = Some(FileFolder::ToolApprovals);
    assert_eq!(kind_of(check_file(folder, APPROVAL)), Ok(()));
    assert_eq!(kind_of(check_file(folder, "waiting.json")), Ok(()));
    for name in [
        "lock",
        "lock.takeover",
        "sub/waiting.json",
        "../waiting.json",
        "waiting.json.tmp",
        &APPROVAL.to_uppercase(),
        &APPROVAL[1..],
    ] {
        assert_eq!(
            kind_of(check_file(folder, name)),
            Err("unsafe_path"),
            "{name}"
        );
    }
    assert_eq!(kind_of(check_list(folder, None)), Ok(()));
    assert_eq!(kind_of(check_list(folder, Some("sub"))), Err("unsafe_path"));
    // Other folders keep their own rules.
    assert_eq!(
        kind_of(check_file(Some(FileFolder::Review), "lock")),
        Ok(())
    );
    assert_eq!(kind_of(check_list(None, Some("sub"))), Ok(()));
}

#[test]
fn tool_approvals_write_private_files_under_the_lock_and_remove_them() {
    let scratch = Scratch::new("write");
    let root = scratch
        .0
        .join("profile")
        .join("tool-approvals")
        .join("source");
    let locks = WriteLocks::default();
    let files = || WorkspaceFolder::new(root.clone(), &locks).private_files();

    let written = run(&root, Making::Folder, files(), |files| {
        files.write(APPROVAL, "{}", None)
    });
    assert_eq!(written.expect("it writes"), WriteOutcome::Written);
    assert!(root.join(APPROVAL).is_file());
    assert!(!root.join("lock").exists(), "the lock is released");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = |path: PathBuf| std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
        assert_eq!(
            mode(scratch.0.join("profile").join("tool-approvals")),
            0o700
        );
        assert_eq!(mode(root.clone()), 0o700);
        assert_eq!(mode(root.join(APPROVAL)), 0o600);
        // A replaced file is private too, whatever it was before.
        std::fs::set_permissions(root.join(APPROVAL), PermissionsExt::from_mode(0o644)).unwrap();
        run(&root, Making::Folder, files(), |files| {
            files.write(APPROVAL, "{ }", None)
        })
        .expect("it replaces");
        assert_eq!(mode(root.join(APPROVAL)), 0o600);
    }

    run(&root, Making::Removing, files(), |files| {
        files.remove(APPROVAL)
    })
    .expect("it removes");
    assert!(!root.join(APPROVAL).exists());
    assert!(!root.join("lock").exists(), "the lock is released");
}

#[test]
fn tool_approvals_remove_from_a_source_with_no_folder_makes_nothing() {
    let scratch = Scratch::new("missing");
    let root = scratch
        .0
        .join("profile")
        .join("tool-approvals")
        .join("source");
    let locks = WriteLocks::default();
    let files = WorkspaceFolder::new(root.clone(), &locks).private_files();

    run(&root, Making::Removing, files, |files| {
        files.remove(APPROVAL)
    })
    .expect("nothing to remove");
    assert!(!scratch.0.join("profile").exists());
}
