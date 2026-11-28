//! The capabilities that grant native access: each is local, for the app's
//! own windows only, and grants exactly its commands, so the Studio the
//! computer serves gets none of them.

use serde_json::{Value, json};

#[test]
fn served_page_test_sees_blobs_and_records_granted_to_the_local_main_window_only() {
    // A remote page must never reach the blobs or records: the served
    // Studio could then read every opened workspace's data.
    for (text, permissions) in [
        (
            include_str!("../../capabilities/desktop-blobs.json"),
            json!(["allow-blob-put", "allow-blob-get"]),
        ),
        (
            include_str!("../../capabilities/desktop-records.json"),
            json!([
                "allow-record-append",
                "allow-record-read",
                "allow-record-replace"
            ]),
        ),
    ] {
        let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
        assert_eq!(capability["local"], true);
        assert_eq!(capability["windows"], json!(["main", "inbox", "messenger"]));
        assert!(capability.get("remote").is_none(), "{capability}");
        assert_eq!(capability["permissions"], permissions);
    }
}

#[test]
fn served_page_test_sees_files_granted_to_the_local_main_window_only() {
    // A remote page must never reach the files: the served Studio could
    // then read and change every opened workspace.
    let text = include_str!("../../capabilities/desktop-files.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main", "inbox", "messenger"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-fs-list",
            "allow-fs-read",
            "allow-fs-write",
            "allow-fs-remove",
            "allow-fs-watch",
            "allow-fs-unwatch",
            "allow-folder-entries",
            "allow-folder-read",
            "allow-folder-location"
        ])
    );
}

#[test]
fn served_page_test_sees_the_agent_host_granted_to_the_local_main_window_only() {
    // A remote page must never reach the agent host: the served Studio could
    // then open sandbox sessions and bridges on this computer.
    let text = include_str!("../../capabilities/desktop-agent-host.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main", "inbox", "messenger"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-agent-host-request",
            "allow-agent-host-stream",
            "allow-agent-host-stream-end",
            "allow-agent-host-security-updates",
            "allow-agent-host-sandbox-choice-save",
            "allow-agent-host-paperclip-restore",
            "allow-agent-host-paperclip-key-kept",
            "allow-engine-ready",
            "allow-start-status"
        ])
    );
}

#[test]
fn served_page_test_sees_the_action_commands_granted_to_the_local_windows_only() {
    // A remote page must never run a stepper's steps: the served Studio
    // could then send calls with the user's own GitHub sign-in.
    let text = include_str!("../../capabilities/desktop-actions.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main", "inbox", "messenger"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-action-send",
            "allow-action-sign-in",
            "allow-action-sign-in-cancel",
            "allow-action-paperclip-sign-in",
            "allow-action-sign-out",
            "allow-action-account",
            "allow-action-open-guided",
            "allow-action-open-page",
            "allow-action-record-append",
            "allow-action-record-read"
        ])
    );
}
