//! Links and folders the account may not read. The page isn't trusted, so a
//! link in a workspace must never let it read, write or remove a file
//! outside. Requirement `workspace-files`; these tests' names start with
//! `workspace_files_`. Making a link on Windows needs rights the CI account
//! may lack, so these run on Unix; Rust counts a Windows junction as a link
//! the same way.
#![cfg(unix)]

mod support;

use std::fs;
use std::os::unix::fs::{PermissionsExt, symlink};

use halonic_workspace_files::{FileError, WorkspaceFolder, WriteLocks};
use support::Scratch;

/// A workspace with an `outside` folder next to it, linked in as `linked`,
/// and a file linked in as `linked.yaml`.
fn linked_workspace(name: &str) -> (Scratch, std::path::PathBuf) {
    let scratch = Scratch::new(name);
    scratch.put("outside/secret.yaml", "secret\n");
    scratch.put("workspace/hubs/hub.yaml", "hub\n");
    let workspace = scratch.at("workspace");
    symlink(scratch.at("outside"), workspace.join("linked")).expect("a folder link");
    symlink(
        scratch.at("outside/secret.yaml"),
        workspace.join("linked.yaml"),
    )
    .expect("a file link");
    (scratch, workspace)
}

#[test]
fn workspace_files_never_list_read_write_or_remove_through_a_link() {
    let (scratch, workspace) = linked_workspace("links");
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(workspace, &locks);
    let linked = |path: &str| FileError::LinkedPath {
        path: path.to_owned(),
    };

    assert_eq!(folder.list(None), Ok(vec!["hubs/hub.yaml".to_owned()]));
    assert_eq!(folder.list(Some("linked")), Err(linked("linked")));
    assert_eq!(
        folder.read("linked/secret.yaml"),
        Err(linked("linked/secret.yaml"))
    );
    assert_eq!(folder.read("linked.yaml"), Err(linked("linked.yaml")));
    assert_eq!(
        folder.write("linked.yaml", "x", None),
        Err(linked("linked.yaml"))
    );
    assert_eq!(
        folder.write("linked/new.yaml", "x", None),
        Err(linked("linked/new.yaml"))
    );
    let deeper = folder.write("linked/new/a.yaml", "x", None);
    assert_eq!(deeper, Err(linked("linked/new/a.yaml")));
    assert_eq!(
        folder.remove("linked/secret.yaml"),
        Err(linked("linked/secret.yaml"))
    );
    assert_eq!(folder.remove("linked.yaml"), Err(linked("linked.yaml")));
    assert_eq!(linked("x").kind(), "private_path");

    assert_eq!(scratch.names_in("outside"), ["secret.yaml"]);
    let secret = fs::read_to_string(scratch.at("outside/secret.yaml"));
    assert_eq!(secret.ok().as_deref(), Some("secret\n"));
}

#[test]
fn workspace_files_keep_a_replaced_files_permissions() {
    let scratch = Scratch::new("mode");
    scratch.put("run.sh", "echo one\n");
    fs::set_permissions(scratch.at("run.sh"), fs::Permissions::from_mode(0o750)).expect("chmod");
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(scratch.path().to_owned(), &locks);

    folder.write("run.sh", "echo two\n", None).expect("written");
    let mode = fs::metadata(scratch.at("run.sh"))
        .expect("the file")
        .permissions()
        .mode();
    assert_eq!(mode & 0o777, 0o750);
}

#[test]
fn workspace_files_name_a_folder_they_may_not_read() {
    let scratch = Scratch::new("unreadable");
    scratch.put("hubs/locked/hub.yaml", "x");
    let locked = scratch.at("hubs/locked");
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).expect("chmod");
    // An account that reads everything anyway, such as root, can't test this.
    let readable = fs::read_dir(&locked).is_ok();
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(scratch.path().to_owned(), &locks);
    let listed = folder.list(None);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o700)).expect("chmod back");
    if readable {
        return;
    }

    let refusal = listed.expect_err("the folder can't be read");
    assert_eq!(refusal.kind(), "folder_unreadable");
    assert_eq!(refusal.folder(), Some("hubs/locked"));
}
