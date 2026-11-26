//! The served page and the host settings: the connect page may read and
//! save them on desktop, and no remote page may.

use serde_json::{Value, json};

#[cfg(desktop)]
use super::{CONNECT_PAGE, app_window, invoke};

#[cfg(desktop)]
#[test]
fn served_page_test_sees_the_connect_page_allowed_the_host_settings_commands_on_desktop() {
    // Each save gets through to its command, which refuses the key before
    // it reads or writes the profile.
    let window = app_window();
    for (command, body) in [
        ("host_settings_set", json!({"key": "Not A Key", "value": 1})),
        ("host_settings_remove", json!({"key": "../host.json"})),
    ] {
        let answer = invoke(&window, CONNECT_PAGE, command, body);
        let refusal = answer.expect_err("the key is invalid");
        assert_eq!(refusal["kind"], "invalid_key", "{command}: {refusal}");
    }
}

#[test]
fn served_page_test_sees_host_settings_granted_to_the_local_main_window_only() {
    // The served Studio may show the settings, but only through the
    // computer's own server; it must never change them through the shell.
    let text = include_str!("../../capabilities/desktop-host-settings.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(
        capability["windows"],
        json!(["main", "inbox", "messenger", "ask"])
    );
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-host-settings-read",
            "allow-host-settings-set",
            "allow-host-settings-remove"
        ])
    );
}
