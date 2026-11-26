//! The chats folder (HAL-17305): the shell finds it in the profile only for
//! an opened workspace, makes it on the first write only, and keeps every
//! path inside it.

use std::path::{Path, PathBuf};

use halonic_git_guard::OpenedFolders;
use halonic_profile::{Platform, ProfileFolder};
use halonic_workspace_files::{Fence, WorkspaceFolder, WriteLocks};

use super::{FileFolder, Making, chats_root, made_for};

/// A folder of its own for one test, with two workspaces and a profile,
/// removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("studio-chats-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        for workspace in ["acme", "globex"] {
            std::fs::create_dir_all(folder.join(workspace)).expect("the scratch folder");
        }
        Self(folder)
    }

    fn workspace(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }

    fn profile(&self) -> ProfileFolder {
        ProfileFolder {
            platform: Platform::current(),
            root: self
                .0
                .join("profile")
                .to_str()
                .expect("a Unicode folder")
                .to_owned(),
        }
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// The chats folder of `workspace`, opened, as `in_workspace` sets it up.
fn chats(scratch: &Scratch, opened: &OpenedFolders, workspace: &Path, making: Making) -> PathBuf {
    let root = chats_root(opened, &scratch.profile(), workspace).expect("an opened workspace");
    made_for(root, making).expect("the chats folder")
}

#[test]
fn chats_take_the_folder_the_adapter_names() {
    let folder = serde_json::from_value::<FileFolder>(serde_json::json!("chats"));
    assert_eq!(folder.ok(), Some(FileFolder::Chats));
}

#[test]
fn chats_are_found_only_for_an_opened_workspace_in_the_profile() {
    let scratch = Scratch::new("opened");
    let acme = scratch.workspace("acme");
    let opened = OpenedFolders::new();

    let refusal = chats_root(&opened, &scratch.profile(), &acme).map_err(|refusal| refusal.kind);
    assert_eq!(refusal, Err("folder_not_open"));

    opened.open(&acme).expect("the folder opens");
    let real_path = std::fs::canonicalize(&acme).expect("the real path");
    let folders = scratch
        .profile()
        .workspace_folders(real_path.to_str().expect("a Unicode path"))
        .expect("the workspace's folders");
    let root = chats_root(&opened, &scratch.profile(), &acme).expect("an opened workspace");
    assert_eq!(root, PathBuf::from(folders.chats_folder()));
    assert!(root.starts_with(scratch.0.join("profile")), "{root:?}");
    assert!(root.ends_with("chats"), "{root:?}");
    assert!(!root.exists(), "finding the folder makes nothing");
}

#[test]
fn chats_folder_is_made_by_a_write_and_never_by_a_list_or_read() {
    let scratch = Scratch::new("making");
    let acme = scratch.workspace("acme");
    let opened = OpenedFolders::new();
    opened.open(&acme).expect("the folder opens");
    let locks = WriteLocks::default();

    let root = chats(&scratch, &opened, &acme, Making::Nothing);
    let folder = WorkspaceFolder::new(root.clone(), &locks).fenced(Fence::Outside);
    assert_eq!(
        folder.list(None).expect("an empty list"),
        Vec::<String>::new()
    );
    assert_eq!(folder.read("c1.json").expect("not found"), None);
    assert!(!root.exists(), "a list or read makes nothing");

    let root = chats(&scratch, &opened, &acme, Making::Folder);
    let folder = WorkspaceFolder::new(root.clone(), &locks).fenced(Fence::Outside);
    folder.write("c1.json", "{}", None).expect("the write");
    assert!(root.join("c1.json").is_file());
    assert_eq!(
        folder.list(None).expect("the list"),
        vec!["c1.json".to_owned()]
    );
}

#[test]
fn chats_refuse_a_path_out_of_the_folder() {
    let scratch = Scratch::new("escape");
    let acme = scratch.workspace("acme");
    let opened = OpenedFolders::new();
    opened.open(&acme).expect("the folder opens");
    let locks = WriteLocks::default();
    let root = chats(&scratch, &opened, &acme, Making::Folder);
    let folder = WorkspaceFolder::new(root, &locks).fenced(Fence::Outside);

    let outside = scratch.0.join("outside.json");
    let absolute = outside.to_str().expect("a Unicode path");
    for path in [
        "../outside.json",
        "../../outside.json",
        "a/../../outside.json",
        absolute,
    ] {
        assert!(folder.write(path, "{}", None).is_err(), "{path} is refused");
        assert!(folder.read(path).is_err(), "{path} is refused");
    }
    assert!(!outside.exists(), "nothing was written outside");
}

#[cfg(unix)]
#[test]
fn chats_refuse_a_link_out_of_the_folder() {
    let scratch = Scratch::new("link");
    let acme = scratch.workspace("acme");
    let opened = OpenedFolders::new();
    opened.open(&acme).expect("the folder opens");
    let locks = WriteLocks::default();
    let root = chats(&scratch, &opened, &acme, Making::Folder);
    let elsewhere = scratch.0.join("elsewhere");
    std::fs::create_dir_all(&elsewhere).expect("the target");
    std::fs::write(elsewhere.join("c1.json"), "{}").expect("a file behind the link");
    std::os::unix::fs::symlink(&elsewhere, root.join("linked")).expect("the link");
    let folder = WorkspaceFolder::new(root, &locks).fenced(Fence::Outside);

    assert!(
        folder.read("linked/c1.json").is_err(),
        "a read through the link is refused"
    );
    assert!(
        folder.write("linked/c2.json", "{}", None).is_err(),
        "a write through it too"
    );
    assert!(
        !elsewhere.join("c2.json").exists(),
        "nothing was written behind the link"
    );
    assert_eq!(folder.list(None).expect("the list"), Vec::<String>::new());
}

#[test]
fn chats_of_one_workspace_are_not_reached_through_another() {
    let scratch = Scratch::new("two");
    let acme = scratch.workspace("acme");
    let globex = scratch.workspace("globex");
    let opened = OpenedFolders::new();
    opened.open(&acme).expect("the folder opens");
    let locks = WriteLocks::default();
    let acme_root = chats(&scratch, &opened, &acme, Making::Folder);
    let acme_folder = WorkspaceFolder::new(acme_root.clone(), &locks).fenced(Fence::Outside);
    acme_folder.write("c1.json", "{}", None).expect("the write");

    let refusal = chats_root(&opened, &scratch.profile(), &globex).map_err(|refusal| refusal.kind);
    assert_eq!(
        refusal,
        Err("folder_not_open"),
        "an unopened workspace is refused"
    );

    opened.open(&globex).expect("the folder opens");
    let globex_root = chats(&scratch, &opened, &globex, Making::Folder);
    assert_ne!(globex_root, acme_root);
    let globex_folder = WorkspaceFolder::new(globex_root, &locks).fenced(Fence::Outside);
    assert_eq!(
        globex_folder.list(None).expect("the list"),
        Vec::<String>::new()
    );
    let acme_key = acme_root
        .parent()
        .and_then(Path::file_name)
        .and_then(|key| key.to_str())
        .expect("acme's key");
    let through = format!("../../{acme_key}/chats/c1.json");
    assert!(
        globex_folder.read(&through).is_err(),
        "{through} is refused"
    );
}

#[cfg(unix)]
#[test]
fn chats_and_review_folders_and_files_are_private_to_the_user() {
    use super::{private_for, review_root};
    use std::os::unix::fs::PermissionsExt;
    let mode = |path: &Path| {
        std::fs::metadata(path)
            .expect("the entry")
            .permissions()
            .mode()
            & 0o777
    };
    let scratch = Scratch::new("private");
    let acme = scratch.workspace("acme");
    let opened = OpenedFolders::new();
    opened.open(&acme).expect("the folder opens");
    let locks = WriteLocks::default();
    let profile = scratch.profile();
    let roots = [
        (FileFolder::Chats, chats_root(&opened, &profile, &acme)),
        (FileFolder::Review, review_root(&opened, &profile, &acme)),
    ];

    for (folder, root) in roots {
        let root =
            made_for(root.expect("an opened workspace"), Making::Folder).expect("the folder");
        let files = WorkspaceFolder::new(root.clone(), &locks).fenced(Fence::Outside);
        let files = private_for(folder, files);
        files.write("a/c1.json", "{}", None).expect("the write");
        assert_eq!(mode(&root), 0o700, "{folder:?}");
        assert_eq!(mode(&root.join("a")), 0o700, "{folder:?}");
        assert_eq!(mode(&root.join("a/c1.json")), 0o600, "{folder:?}");
    }
}
