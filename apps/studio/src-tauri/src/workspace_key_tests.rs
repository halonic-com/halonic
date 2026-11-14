//! Requirement `workspace-key-command`: the key `workspace_key` answers for
//! an opened workspace.

use std::path::{Path, PathBuf};

use halonic_git_guard::OpenedFolders;
use halonic_profile::{Platform, ProfileFolder};

use super::WorkspaceKey;
use crate::workspace_data::opened_workspace_folders;

/// A workspace folder of its own for one test, removed when the test ends.
struct Workspace(PathBuf);

impl Workspace {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("workspace-key-{name}-{}", std::process::id()));
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
    ProfileFolder {
        platform: Platform::current(),
        root: std::env::temp_dir()
            .join("workspace-key-profile")
            .to_str()
            .expect("a Unicode temporary folder")
            .to_owned(),
    }
}

fn answer_for(
    opened: &OpenedFolders,
    workspace: &Path,
) -> Result<WorkspaceKey, super::DataRefusal> {
    opened_workspace_folders(opened, &profile(), workspace)
        .map(|folders| WorkspaceKey::from(&folders))
}

#[test]
fn workspace_key_command_answers_the_key_that_names_the_folder_record_commands_use() {
    let workspace = Workspace::new("opened");
    let opened = OpenedFolders::new();
    opened.open(workspace.path()).unwrap();

    let answer = answer_for(&opened, workspace.path()).expect("an opened folder has a key");

    let folders = opened_workspace_folders(&opened, &profile(), workspace.path()).unwrap();
    let records_folder = folders.records_folder();
    let record_folder_key = Path::new(&records_folder)
        .parent()
        .and_then(Path::file_name)
        .and_then(|name| name.to_str())
        .expect("the records folder is inside the workspace's folder");
    assert_eq!(answer.key, record_folder_key);
    assert_eq!(answer.key.len(), 32);
}

#[test]
fn workspace_key_command_answers_the_same_key_for_a_roundabout_path() {
    let workspace = Workspace::new("roundabout");
    std::fs::create_dir_all(workspace.path().join("sub")).unwrap();
    let opened = OpenedFolders::new();
    opened.open(workspace.path()).unwrap();

    let direct = answer_for(&opened, workspace.path()).unwrap();
    let roundabout = answer_for(&opened, &workspace.path().join("sub").join("..")).unwrap();

    assert_eq!(direct, roundabout);
}

#[test]
fn workspace_key_command_refuses_a_folder_that_isn_t_opened() {
    let workspace = Workspace::new("not-opened");

    let refusal =
        answer_for(&OpenedFolders::new(), workspace.path()).expect_err("nothing is opened");

    assert_eq!(refusal.kind, "folder_not_open");
}

#[test]
fn workspace_key_command_answers_the_key_and_no_path() {
    let workspace = Workspace::new("no-path");
    let opened = OpenedFolders::new();
    opened.open(workspace.path()).unwrap();

    let answer = answer_for(&opened, workspace.path()).unwrap();

    let json = serde_json::to_string(&answer).unwrap();
    assert_eq!(json, format!("{{\"key\":\"{}\"}}", answer.key));
    assert!(!json.contains("workspace-key-no-path"));
}
