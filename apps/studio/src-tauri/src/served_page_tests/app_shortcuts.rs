//! The served page and the phone's shortcuts (HAL-19143): only the phone's
//! own page may take a shortcut's screen, set the last chat or pin a
//! screen, on Android only, and no page may reach the Kotlin plugin's own
//! commands.

use serde_json::{Value, json};
use tauri::test::MockRuntime;
use tauri::{Manager, Webview};

use super::{CONNECT_PAGE, SERVED_PAGE, app_window, invoke};
use crate::app_shortcuts::{
    PinScreen, phone_can_pin, phone_last_chat, phone_open_target, phone_pin,
};

const COMMANDS: [&str; 4] = [
    "phone_open_target",
    "phone_last_chat",
    "phone_can_pin",
    "phone_pin",
];

/// Arguments each command would take from the phone's own page.
fn args(command: &str) -> Value {
    match command {
        "phone_last_chat" => json!({ "chat": null }),
        "phone_pin" => json!({ "screen": "inbox" }),
        _ => json!({}),
    }
}

#[test]
fn served_page_is_refused_the_phone_s_shortcuts() {
    let window = app_window();
    for command in COMMANDS {
        let refusal = invoke(&window, SERVED_PAGE, command, args(command))
            .expect_err("the served page reaches no shortcut");
        assert!(
            refusal.to_string().contains("not allowed"),
            "{command} failed for another reason: {refusal}"
        );
    }
}

#[cfg(desktop)]
#[test]
fn served_page_test_sees_no_page_allowed_the_phone_s_shortcuts_on_desktop() {
    let window = app_window();
    for from in [CONNECT_PAGE, SERVED_PAGE] {
        for command in COMMANDS {
            assert!(
                invoke(&window, from, command, args(command)).is_err(),
                "{command} must be refused from {from}"
            );
        }
    }
}

#[test]
fn served_page_test_sees_the_phone_s_shortcuts_granted_to_the_phone_s_own_page_only() {
    let text = include_str!("../../capabilities/app-shortcuts.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert_eq!(capability["platforms"], json!(["android"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-phone-open-target",
            "allow-phone-last-chat",
            "allow-phone-can-pin",
            "allow-phone-pin"
        ])
    );
}

#[test]
fn no_capability_names_the_app_shortcuts_plugin() {
    // The Kotlin plugin's own commands (`takeOpenTarget`, `setLastChat`,
    // `forgetComputer`, `canPin`, `pin`) are reached only from Rust while no
    // capability grants the plugin, whose permissions all start with
    // `app-shortcuts:`. The mock app has no Android plugin, so an invoke
    // would be refused whatever the capabilities say (Liam, #6357).
    for (path, text) in super::owner_check::capabilities() {
        assert!(
            !text.contains("app-shortcuts:"),
            "{} must not grant the app shortcuts plugin",
            path.display()
        );
    }
}

#[test]
fn phone_s_shortcuts_do_nothing_while_the_window_is_on_the_served_page() {
    let window = app_window();
    let webview: Webview<MockRuntime> = window
        .app_handle()
        .get_webview_window("main")
        .expect("the main window")
        .as_ref()
        .clone();
    webview
        .navigate(SERVED_PAGE.parse().expect("a test URL"))
        .expect("the mock webview navigates");
    use tauri::async_runtime::block_on;
    assert_eq!(block_on(phone_open_target(webview.clone())), None);
    assert!(!block_on(phone_last_chat(webview.clone(), None)));
    assert!(!block_on(phone_can_pin(webview.clone())));
    assert!(!block_on(phone_pin(webview, PinScreen::Messenger)));
}
