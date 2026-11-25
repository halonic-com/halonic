use std::path::PathBuf;

use serde_json::{Value, json};

use super::{noticed_folder, open_workspace_notice};

#[test]
fn opened_workspaces_notice_names_the_folder_and_nothing_else() {
    let (notice, name) = open_workspace_notice(&PathBuf::from("/work/acme")).expect("a notice");
    assert_eq!(name, "/work/acme");
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

#[test]
fn opened_workspaces_noticed_is_read_only_from_exactly_its_answer() {
    assert_eq!(
        noticed_folder(br#"{"op":"noticed","folder":"/work/acme"}"#).as_deref(),
        Some("/work/acme")
    );
    for other in [
        &br#"{"op":"get","name":"remote_host_key"}"#[..],
        br#"{"op":"noticed","folder":"/work/acme","extra":1}"#,
        br#"{"op":"noticed"}"#,
        b"not json",
    ] {
        assert_eq!(noticed_folder(other), None);
    }
}
