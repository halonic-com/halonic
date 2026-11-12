//! Requirement `workspace-data-commands`: the folders the blob and record
//! commands work out for an opened workspace.

use std::path::{Path, PathBuf};

use halonic_git_guard::OpenedFolders;
use halonic_profile::{Platform, ProfileFolder};

use super::opened_workspace_folders;

/// A workspace folder of its own for one test, removed when the test ends.
struct Workspace(PathBuf);

impl Workspace {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("workspace-data-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the workspace can be created");
        Self(folder)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Workspace {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// A profile under the system's temporary folder; nothing is created in it.
fn profile() -> ProfileFolder {
    let root = std::env::temp_dir().join("workspace-data-profile");
    ProfileFolder {
        platform: Platform::current(),
        root: root
            .to_str()
            .expect("a Unicode temporary folder")
            .to_owned(),
    }
}

#[test]
fn workspace_data_commands_find_an_opened_workspace_s_blobs_and_records_in_the_profile() {
    let workspace = Workspace::new("opened");
    std::fs::create_dir_all(workspace.path().join("sub")).unwrap();
    let opened = OpenedFolders::new();
    opened.open(workspace.path()).unwrap();
    let real_path = std::fs::canonicalize(workspace.path()).unwrap();
    let expected = profile()
        .workspace_folders(real_path.to_str().unwrap())
        .unwrap();

    // `<workspace>/sub/..` is the workspace: the CLI's realpath gives the same folder.
    let roundabout = workspace.path().join("sub").join("..");
    let folders = opened_workspace_folders(&opened, &profile(), &roundabout).unwrap();
    assert_eq!(folders, expected);
    assert!(Path::new(&folders.blobs_folder()).ends_with("blobs"));
    assert!(Path::new(&folders.records_folder()).ends_with("records"));
}

#[test]
fn workspace_data_commands_refuse_a_workspace_that_isn_t_opened() {
    let workspace = Workspace::new("not-opened");
    let refused = opened_workspace_folders(&OpenedFolders::new(), &profile(), workspace.path());
    let refusal = refused.expect_err("nothing is opened");
    assert_eq!(refusal.kind, "folder_not_open");
    assert!(
        refusal.message.ends_with("is not an opened folder"),
        "{refusal:?}"
    );
}
