//! Lists that leave out the folders the page names: agents' working folders
//! and `node_modules`. Requirement `left-out`; these tests' names start with
//! `left_out_`.

mod support;

use halonic_workspace_files::{LeaveOut, WorkspaceFolder, WriteLocks};
use support::Scratch;

fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|&value| value.to_owned()).collect()
}

/// A workspace with a definition, a working folder `repo` and two
/// `node_modules` folders.
fn workspace(name: &str) -> Scratch {
    let scratch = Scratch::new(name);
    for path in [
        "workspace.yaml",
        "repository.md",
        "repo/src/a.ts",
        "node_modules/x/index.js",
        "tools/Node_Modules/y.js",
        "tools/run.sh",
    ] {
        scratch.put(path, "x");
    }
    scratch
}

#[test]
fn left_out_folders_and_names_are_not_listed() {
    let scratch = workspace("left-out-list");
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(scratch.path().to_owned(), &locks);
    let leave_out =
        LeaveOut::new(&strings(&["REPO"]), &strings(&["node_modules"])).expect("a safe leave-out");

    assert_eq!(
        folder.list_leaving_out(None, &leave_out),
        Ok(strings(&[
            "repository.md",
            "tools/run.sh",
            "workspace.yaml"
        ]))
    );
    assert_eq!(
        folder.list_leaving_out(Some("repo"), &leave_out),
        Ok(vec![])
    );
    assert_eq!(
        folder.list_leaving_out(Some("tools"), &leave_out),
        Ok(strings(&["tools/run.sh"]))
    );
}

#[test]
fn left_out_files_still_list_without_the_option_and_still_read() {
    let scratch = workspace("left-out-default");
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(scratch.path().to_owned(), &locks);

    let listed = folder.list(None).expect("the workspace lists");
    assert!(listed.contains(&"repo/src/a.ts".to_owned()), "{listed:?}");
    assert!(
        listed.contains(&"node_modules/x/index.js".to_owned()),
        "{listed:?}"
    );
    assert_eq!(folder.read("repo/src/a.ts"), Ok(Some("x".to_owned())));
}

#[cfg(unix)]
#[test]
fn left_out_folders_are_never_stepped_into() {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    let scratch = workspace("left-out-unreadable");
    scratch.put("repo/locked/a.ts", "x");
    let locked = scratch.at("repo/locked");
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).expect("chmod");
    // An account that reads everything anyway, such as root, can't test this.
    let readable = fs::read_dir(&locked).is_ok();
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(scratch.path().to_owned(), &locks);
    let leave_out = LeaveOut::new(&strings(&["repo"]), &[]).expect("a safe leave-out");
    let left_out = folder.list_leaving_out(None, &leave_out);
    let whole = folder.list(None);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o700)).expect("chmod back");

    assert!(left_out.is_ok(), "{left_out:?}");
    if !readable {
        let refusal = whole.expect_err("without the option the walk reaches the folder");
        assert_eq!(refusal.folder(), Some("repo/locked"));
    }
}

#[test]
fn left_out_refuses_what_could_reach_further_than_it_says() {
    for (folders, names) in [
        (strings(&["a/../b"]), vec![]),
        (strings(&["..."]), vec![]),
        (vec![], strings(&["a/b"])),
    ] {
        let refused = LeaveOut::new(&folders, &names).map_err(|error| error.kind());
        assert_eq!(refused, Err("unsafe_path"), "{folders:?} {names:?}");
    }
}
