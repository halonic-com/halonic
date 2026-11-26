//! The served page and the phone's owner check: no page may ask for the
//! biometric prompt or read its status, from any address. The phone's own
//! page may only ask `owner_check_available`, on Android only (HAL-15194).

use serde_json::{Value, json};
use tauri::test::MockRuntime;
use tauri::{Manager, Webview};

use super::{CONNECT_PAGE, SERVED_PAGE, app_window, invoke};
use crate::owner_check_page::available;

const AVAILABLE: &str = "owner_check_available";
const PERMISSION: &str = "allow-owner-check-available";

#[test]
fn no_page_may_call_the_owner_check() {
    // Only the shell asks for the owner check, from Rust, with the prompt's
    // words fixed there (HAL-15194). The plugin is registered on Android
    // only, but the ACL refuses its commands anywhere.
    let window = app_window();
    for from in [CONNECT_PAGE, SERVED_PAGE] {
        for command in [
            "plugin:owner-check|owner_check_status",
            "plugin:owner-check|ownerCheckStatus",
            "plugin:owner-check|confirm_owner",
            "plugin:owner-check|confirmOwner",
            "plugin:owner-check|close_owner_check",
            "plugin:owner-check|closeOwnerCheck",
            "plugin:owner-check|owner_check_away",
            "plugin:owner-check|ownerCheckAway",
        ] {
            assert!(
                invoke(
                    &window,
                    from,
                    command,
                    json!({ "title": "t", "description": "d", "cancel": "c" })
                )
                .is_err(),
                "{command} must be refused from {from}"
            );
        }
    }
}

/// Every capability file, so one added later is checked too.
fn capabilities() -> Vec<(std::path::PathBuf, String)> {
    let folder = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
    let files = std::fs::read_dir(&folder).expect("the capabilities folder is readable");
    files
        .map(|file| {
            let path = file.expect("a capability file is listed").path();
            let text = std::fs::read_to_string(&path).expect("a capability file is readable");
            (path, text)
        })
        .collect()
}

#[test]
fn no_capability_names_the_owner_check_plugin() {
    // The refusal above holds only while no capability grants the plugin,
    // whose permissions all start with `owner-check:`.
    for (path, text) in capabilities() {
        assert!(
            !text.contains("owner-check:"),
            "{} must not grant the owner check plugin",
            path.display()
        );
    }
}

#[test]
fn owner_check_available_is_granted_to_the_phone_s_own_page_only() {
    let mut granting = Vec::new();
    for (path, text) in capabilities() {
        let capability: Value = serde_json::from_str(&text).expect("a capability is JSON");
        let permissions = capability["permissions"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        if permissions
            .iter()
            .any(|permission| permission == PERMISSION)
        {
            granting.push(path.file_name().expect("a file name").to_owned());
            // Not for the desktop, not for another window, not remote.
            assert_eq!(
                capability["platforms"],
                json!(["android"]),
                "{}",
                path.display()
            );
            assert_eq!(capability["windows"], json!(["main"]), "{}", path.display());
            assert_eq!(capability["local"], true, "{}", path.display());
            assert!(capability.get("remote").is_none(), "{}", path.display());
            assert_eq!(
                capability["permissions"],
                json!([PERMISSION]),
                "{}",
                path.display()
            );
        }
    }
    assert_eq!(granting, ["phone-owner-check.json"]);
}

#[test]
fn served_page_is_refused_owner_check_available() {
    let window = app_window();
    let refusal = invoke(&window, SERVED_PAGE, AVAILABLE, json!({}))
        .expect_err("the served page may not ask about the owner check");
    assert!(
        refusal.to_string().contains("not allowed"),
        "refused for another reason: {refusal}"
    );
}

#[cfg(desktop)]
#[test]
fn owner_check_available_is_refused_to_every_page_on_desktop() {
    let window = app_window();
    for from in [CONNECT_PAGE, SERVED_PAGE] {
        assert!(
            invoke(&window, from, AVAILABLE, json!({})).is_err(),
            "{AVAILABLE} must be refused from {from}"
        );
    }
}

fn main_webview() -> Webview<MockRuntime> {
    let window = app_window();
    window
        .app_handle()
        .get_webview_window("main")
        .expect("the main window")
        .as_ref()
        .clone()
}

#[test]
fn owner_check_available_answers_false_without_the_android_check() {
    // Desktop, or an Android shell whose plugin didn't load: fails closed.
    let webview = main_webview();
    assert!(!tauri::async_runtime::block_on(available(&webview)));
}

#[test]
fn owner_check_available_answers_false_while_the_window_is_on_the_served_page() {
    let webview = main_webview();
    webview
        .navigate(SERVED_PAGE.parse().expect("a test URL"))
        .expect("the mock webview navigates");
    assert!(!tauri::async_runtime::block_on(available(&webview)));
}
