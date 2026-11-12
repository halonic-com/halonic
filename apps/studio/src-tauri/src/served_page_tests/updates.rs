//! The served page and the update commands: the connect page may read the
//! update status, and no page gets the updater plugin's own commands.

use serde_json::{Value, json};

use super::{CONNECT_PAGE, app_window, invoke};

#[test]
fn served_page_test_sees_the_connect_page_read_the_update_status_on_desktop() {
    let window = app_window();
    let status = invoke(&window, CONNECT_PAGE, "update_status", json!({}))
        .expect("the local page reads the update status");
    assert_eq!(status["state"], json!({ "kind": "never-checked" }));
    assert_eq!(status["automatic"], true);
    assert_eq!(status["checking"], false);
}

#[test]
fn served_page_test_sees_the_updater_plugin_granted_to_no_page() {
    // The page acts through the update_* commands only: the plugin's own
    // commands would let it install whatever the release page offers.
    let window = app_window();
    let Err(refusal) = invoke(&window, CONNECT_PAGE, "plugin:updater|check", json!({})) else {
        panic!("the updater plugin must be refused to the local page too");
    };
    assert!(refusal.to_string().contains("not allowed"), "{refusal}");
    let text = include_str!("../../capabilities/desktop-updates.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-update-status",
            "allow-update-watch",
            "allow-update-check",
            "allow-update-download",
            "allow-update-cancel",
            "allow-update-restart",
            "allow-update-set-automatic"
        ])
    );
}
