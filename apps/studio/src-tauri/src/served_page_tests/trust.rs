//! The served page and the trust commands: the connect page may grant and
//! keep trust on desktop, and no remote page may.

use serde_json::{Value, json};

#[cfg(desktop)]
use super::{CONNECT_PAGE, app_window, invoke};

#[cfg(desktop)]
#[test]
fn served_page_test_sees_the_connect_page_allowed_the_trust_commands_on_desktop() {
    // The grant gets through to the command, which refuses the folder
    // before it saves anything or asks the person.
    let window = app_window();
    let missing = std::env::temp_dir().join("served-page-no-such-folder");
    let record = json!({"location": missing.display().to_string(), "pins": {}});
    let answer = invoke(
        &window,
        CONNECT_PAGE,
        "trust_grant",
        json!({"record": record}),
    );
    let refusal = answer.expect_err("the folder doesn't exist");
    assert_eq!(refusal["kind"], "folder_unreadable", "{refusal}");
}

#[cfg(desktop)]
#[test]
fn served_page_test_sees_the_connect_page_allowed_the_instruction_trust_commands_on_desktop() {
    // The save gets through to the command, which refuses a record that
    // isn't trusted instructions before it asks the person or writes
    // anything.
    let window = app_window();
    let answer = invoke(
        &window,
        CONNECT_PAGE,
        "instruction_trust_save",
        json!({"record": {"location": "/workspaces/acme", "agent": "coder"}}),
    );
    let refusal = answer.expect_err("the record isn't trusted instructions");
    assert_eq!(refusal["kind"], "invalid_record", "{refusal}");
}

#[test]
fn served_page_test_sees_trust_granted_to_the_local_main_window_only() {
    // Trust must never reach a remote page or another window: the served
    // Studio could then open folders by asking the person.
    let text = include_str!("../../capabilities/desktop-trust.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-pick-folder",
            "allow-documents-folder",
            "allow-pick-parent-folder",
            "allow-create-workspace-folder",
            "allow-probe-workspace-folder",
            "allow-open-workspace-folder",
            "allow-trust-get",
            "allow-trust-list",
            "allow-trust-folders-found",
            "allow-trust-grant",
            "allow-trust-revoke",
            "allow-instruction-trust-get",
            "allow-instruction-trust-save",
            "allow-instruction-trust-remove",
            "allow-reopen-folder",
            "allow-forget-folder",
            "allow-command-paths"
        ])
    );
}
