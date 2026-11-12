//! The profile is off limits to the file calls, even when an opened folder
//! holds it (HAL-7039): with the home folder opened, the page must not
//! write the shell's own files. Requirement `workspace-files`; these tests'
//! names start with `workspace_files_`.

mod support;

use std::fs;

use halonic_workspace_files::{
    Fence, FileError, FolderSnapshot, WorkspaceFolder, WriteLocks, WriteOutcome,
};
use support::Scratch;

const LIST: &str = ".local/share/halonic/studio/picked-folders.json";

fn private(path: &str) -> Result<(), FileError> {
    Err(FileError::PrivatePath {
        path: path.to_owned(),
    })
}

#[test]
fn workspace_files_refuse_the_profile_inside_an_opened_folder() {
    let home = Scratch::new("fence-home");
    home.put(LIST, "{\"version\":1,\"folders\":[]}\n");
    home.put(".local/share/other/notes.md", "notes\n");
    home.put("work/hub.yaml", "hub\n");
    let fence = Fence::around(home.path(), &home.at(".local/share/halonic"));
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(home.path().to_owned(), &locks).fenced(fence.clone());

    assert_eq!(
        folder.list(None),
        Ok(vec![
            ".local/share/other/notes.md".to_owned(),
            "work/hub.yaml".to_owned(),
        ])
    );
    let snapshot = FolderSnapshot::of(home.path(), &fence).expect("a look");
    assert_eq!(
        snapshot.changed_since(&FolderSnapshot::default()),
        [".local/share/other/notes.md", "work/hub.yaml"]
    );
    assert_eq!(
        folder.list(Some(".local/share/halonic")).map(|_| ()),
        private(".local/share/halonic")
    );
    assert_eq!(folder.read(LIST).map(|_| ()), private(LIST));
    let forged = "{\"version\":1,\"folders\":[{\"location\":\"/\"}]}";
    assert_eq!(folder.write(LIST, forged, None).map(|_| ()), private(LIST));
    assert_eq!(folder.remove(LIST), private(LIST));
    // A name that only differs in case may be the same folder.
    let shouted = ".local/share/HALONIC/studio/picked-folders.json";
    assert_eq!(
        folder.write(shouted, forged, None).map(|_| ()),
        private(shouted)
    );
    assert_eq!(
        fs::read_to_string(home.at(LIST)).expect("the list is there"),
        "{\"version\":1,\"folders\":[]}\n"
    );
    // The rest of the folder works as before.
    assert_eq!(
        folder.write(".local/share/other/notes.md", "more\n", None),
        Ok(WriteOutcome::Written)
    );
}

#[test]
fn workspace_files_refuse_a_profile_not_made_yet() {
    let home = Scratch::new("fence-not-made");
    let fence = Fence::around(home.path(), &home.at(".local/share/halonic"));
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(home.path().to_owned(), &locks).fenced(fence);

    assert_eq!(folder.write(LIST, "{}", None).map(|_| ()), private(LIST));
    assert!(!home.at(".local").exists());
}

#[test]
fn workspace_files_refuse_every_path_in_a_folder_inside_the_profile() {
    let profile = Scratch::new("fence-inside");
    profile.put("studio/picked-folders.json", "{}\n");
    let root = profile.at("studio");
    let fence = Fence::around(&root, profile.path());
    assert_eq!(fence, Fence::Whole);
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(root.clone(), &locks).fenced(fence.clone());

    assert_eq!(folder.list(None).map(|_| ()), private(""));
    let file = "picked-folders.json";
    assert_eq!(folder.read(file).map(|_| ()), private(file));
    assert_eq!(folder.write(file, "{}", None).map(|_| ()), private(file));
    assert_eq!(FolderSnapshot::of(&root, &fence).map(|_| ()), private(""));
}

#[test]
fn workspace_files_fence_nothing_outside_the_opened_folder() {
    let scratch = Scratch::new("fence-outside");
    scratch.put("workspace/hub.yaml", "hub\n");
    scratch.put("profile/studio/picked-folders.json", "{}\n");
    let fence = Fence::around(&scratch.at("workspace"), &scratch.at("profile"));
    assert_eq!(fence, Fence::Outside);
    // A sibling whose name starts the same isn't inside.
    let fence = Fence::around(&scratch.at("workspace"), &scratch.at("workspace-profile"));
    assert_eq!(fence, Fence::Outside);
}

#[cfg(unix)]
#[test]
fn workspace_files_fence_the_profile_a_link_names() {
    let home = Scratch::new("fence-link");
    home.put("data/halonic/studio/picked-folders.json", "{}\n");
    // The profile is named through a link outside the folder, as
    // `HALONIC_HOME` might name it; its real path is what is fenced.
    let elsewhere = Scratch::new("fence-link-elsewhere");
    std::os::unix::fs::symlink(home.at("data/halonic"), elsewhere.at("profile"))
        .expect("a folder link");
    let fence = Fence::around(home.path(), &elsewhere.at("profile"));
    assert_eq!(
        fence,
        Fence::At(vec!["data".to_owned(), "halonic".to_owned()])
    );
}
