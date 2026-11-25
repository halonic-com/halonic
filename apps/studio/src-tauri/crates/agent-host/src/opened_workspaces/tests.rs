use std::path::PathBuf;

use serde_json::{Value, json};

use super::open_workspace_notice;

#[test]
fn opened_workspaces_notice_names_the_folder_and_nothing_else() {
    let notice = open_workspace_notice(&PathBuf::from("/work/acme")).expect("a notice");
    let notice: Value = serde_json::from_slice(&notice).expect("JSON");
    assert_eq!(
        notice,
        json!({ "op": "open_workspace", "folder": "/work/acme" })
    );
}

#[test]
fn opened_workspaces_notice_is_none_when_it_wouldnt_fit_in_one_frame() {
    let long = PathBuf::from(format!("/{}", "a".repeat(64 * 1024)));
    assert!(open_workspace_notice(&long).is_none());
}

#[cfg(unix)]
#[test]
fn opened_workspaces_notice_is_none_for_a_path_that_isnt_utf8() {
    use std::os::unix::ffi::OsStrExt;
    let folder = PathBuf::from(std::ffi::OsStr::from_bytes(b"/work/\xff"));
    assert!(open_workspace_notice(&folder).is_none());
}
