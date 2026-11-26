//! The served page and the phone's ways out to Android's screens
//! (HAL-16438): only the phone's own page may open Android's settings for
//! the app or the Tailscale app, on Android only, and no page may reach the
//! Kotlin plugin's own commands.

use serde_json::{Value, json};
use tauri::test::MockRuntime;
use tauri::{Manager, Webview};

use super::{CONNECT_PAGE, SERVED_PAGE, app_window, invoke};
use crate::phone_screens::open;

const COMMANDS: [&str; 2] = ["phone_open_settings", "phone_open_tailscale"];

#[test]
fn served_page_is_refused_the_phone_s_screens() {
    let window = app_window();
    for command in COMMANDS {
        let refusal = invoke(&window, SERVED_PAGE, command, json!({}))
            .expect_err("the served page opens no Android screen");
        assert!(
            refusal.to_string().contains("not allowed"),
            "{command} failed for another reason: {refusal}"
        );
    }
}

#[cfg(desktop)]
#[test]
fn served_page_test_sees_no_page_allowed_the_phone_s_screens_on_desktop() {
    let window = app_window();
    for from in [CONNECT_PAGE, SERVED_PAGE] {
        for command in COMMANDS {
            assert!(
                invoke(&window, from, command, json!({})).is_err(),
                "{command} must be refused from {from}"
            );
        }
    }
}

#[test]
fn served_page_test_sees_the_phone_s_screens_granted_to_the_phone_s_own_page_only() {
    let text = include_str!("../../capabilities/phone-screens.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert_eq!(capability["platforms"], json!(["android"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!(["allow-phone-open-settings", "allow-phone-open-tailscale"])
    );
}

#[test]
fn no_page_may_call_the_phone_screens_plugin() {
    // Only the shell calls it, from Rust, with a fixed command, so a page
    // can't name a screen, an app or an address of its own.
    let window = app_window();
    for from in [CONNECT_PAGE, SERVED_PAGE] {
        for command in [
            "plugin:phone-screens|openAppSettings",
            "plugin:phone-screens|openTailscale",
            "plugin:phone-screens|open_app_settings",
            "plugin:phone-screens|open_tailscale",
        ] {
            assert!(
                invoke(&window, from, command, json!({})).is_err(),
                "{command} must be refused from {from}"
            );
        }
    }
}

#[test]
fn phone_screens_open_nothing_while_the_window_is_on_the_served_page() {
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
    for screen in ["openAppSettings", "openTailscale"] {
        assert!(!tauri::async_runtime::block_on(open(&webview, screen)));
    }
}

#[test]
fn served_page_test_sees_pull_request_links_granted_to_the_phone_s_own_page_only() {
    // The Messenger tab's links (HAL-19050): the opener on Android, for a
    // GitHub pull request page only, so a message can't open another site.
    let text = include_str!("../../capabilities/phone-links.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert_eq!(capability["platforms"], json!(["android"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!([{
            "identifier": "opener:allow-open-url",
            "allow": [{ "url": "https://github.com/*/*/pull/*" }]
        }])
    );
}
