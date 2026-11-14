//! The served page and the engine lock commands: the connect page may hold and
//! release the workspace's engine lock on desktop, and no remote page may.

use serde_json::{Value, json};

#[cfg(desktop)]
use super::{CONNECT_PAGE, app_window, invoke};

#[cfg(desktop)]
#[test]
fn served_page_test_sees_the_connect_page_allowed_the_engine_lock_commands_on_desktop() {
    // Each call gets through to its command, which refuses the workspace
    // before it makes a folder or a lock: no folder is opened yet.
    let window = app_window();
    for command in ["engine_lock_hold", "engine_lock_release"] {
        let answer = invoke(&window, CONNECT_PAGE, command, json!({"workspace": "."}));
        let refusal = answer.expect_err("no folder is opened yet");
        assert_eq!(refusal["kind"], "folder_not_open", "{command}: {refusal}");
    }
}

#[test]
fn served_page_test_sees_the_engine_lock_granted_to_the_local_main_window_only() {
    // A remote page must never hold or release an engine lock: the served
    // Studio could then lock the person's engine out of a workspace.
    let text = include_str!("../../capabilities/desktop-engine-lock.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!(["allow-engine-lock-hold", "allow-engine-lock-release"])
    );
}
