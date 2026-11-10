//! The served Studio gets no native access (HAL-196 section 3, Julian's
//! checklist): every app and plugin command the shell knows is refused when
//! the request comes from the computer's address, while the connect page
//! may still call `connect` and, on desktop, `git`, the `secret_*`
//! commands, `pick_folder` and the `trust_*` commands.

use serde_json::{Value, json};
use tauri::WebviewUrl;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder};
use tauri::webview::{InvokeRequest, WebviewWindow, WebviewWindowBuilder};

use crate::shell;

/// Where the connect page runs, as Tauri sees it on this platform.
const CONNECT_PAGE: &str = if cfg!(any(windows, target_os = "android")) {
    "http://tauri.localhost/"
} else {
    "tauri://localhost/"
};

/// A computer's address, as the served Studio would call from it.
const SERVED_PAGE: &str = "http://192.168.1.20:4280/";

/// Every command of the app and of every plugin the shell is built with,
/// in the form a page invokes it: `connect`, `plugin:opener|open_url`,
/// `plugin:event|listen` and so on. Read from the ACL manifests that the
/// build step wrote, so a new plugin or command is covered without editing
/// this test.
fn every_command() -> Vec<String> {
    let manifests: Value = serde_json::from_str(include_str!(concat!(
        env!("OUT_DIR"),
        "/acl-manifests.json"
    )))
    .expect("the build step writes the ACL manifests");
    let mut commands = Vec::new();
    for (key, manifest) in manifests.as_object().expect("manifests by plugin") {
        let permissions = manifest["permissions"].as_object().expect("permissions");
        let names = permissions
            .values()
            .flat_map(|permission| permission["commands"]["allow"].as_array().cloned())
            .flatten()
            .filter_map(|name| name.as_str().map(str::to_owned));
        for name in names {
            commands.push(match key.as_str() {
                "__app-acl__" => name,
                plugin => format!("plugin:{}|{name}", plugin.trim_start_matches("core:")),
            });
        }
    }
    commands.sort();
    commands.dedup();
    commands
}

/// The shell on Tauri's mock runtime, with the window that
/// tauri.conf.json opens. The mock opens configured windows only when the
/// app runs, so the test opens it under the same label.
fn app_window() -> WebviewWindow<MockRuntime> {
    let app = shell(mock_builder())
        .build(tauri::generate_context!())
        .expect("the shell builds on the mock runtime");
    WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
        .build()
        .expect("the main window opens")
}

fn invoke(
    window: &WebviewWindow<MockRuntime>,
    from: &str,
    command: &str,
    body: Value,
) -> Result<Value, Value> {
    get_ipc_response(
        window,
        InvokeRequest {
            cmd: command.to_owned(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: from.parse().expect("a test URL"),
            body: InvokeBody::Json(body),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_owned(),
        },
    )
    .map(|answer| answer.deserialize().expect("a JSON answer"))
}

#[test]
fn served_page_is_refused_every_app_and_plugin_command() {
    let window = app_window();
    let commands = every_command();
    // The list must really hold the shell's command and its plugins'.
    for expected in [
        "connect",
        "git",
        "secret_get",
        "secret_set",
        "secret_delete",
        "pick_folder",
        "trust_get",
        "trust_list",
        "trust_grant",
        "trust_revoke",
        "plugin:opener|open_url",
        "plugin:event|listen",
    ] {
        assert!(
            commands.iter().any(|command| command == expected),
            "{expected} missing from {commands:?}"
        );
    }
    for command in &commands {
        let Err(refusal) = invoke(&window, SERVED_PAGE, command, json!({})) else {
            panic!("{command} must be refused from the served page");
        };
        assert!(
            refusal.to_string().contains("not allowed"),
            "{command} failed for another reason: {refusal}"
        );
    }
}

#[test]
fn served_page_test_sees_the_connect_page_allowed_to_connect() {
    // Without this, a shell that refused everything would pass the test above.
    let window = app_window();
    let answer = invoke(
        &window,
        CONNECT_PAGE,
        "connect",
        json!({"address": "not an address"}),
    );
    assert_eq!(answer, Ok(json!({"kind": "notAnAddress"})));
}

#[cfg(desktop)]
#[test]
fn served_page_test_sees_the_connect_page_allowed_to_run_git_on_desktop() {
    // The page gets through to the command, and the command refuses the
    // folder: no folder is open until the person picks or trusts one.
    let window = app_window();
    let answer = invoke(
        &window,
        CONNECT_PAGE,
        "git",
        json!({"root": ".", "args": ["status"]}),
    );
    let refusal = answer.expect_err("no folder is opened yet");
    assert_eq!(refusal["kind"], "folder_not_opened", "{refusal}");
}

#[cfg(desktop)]
#[test]
fn served_page_test_sees_the_connect_page_allowed_the_secret_commands_on_desktop() {
    // Each call gets through to its command, and the command refuses the
    // name before it reaches the keychain, which CI doesn't have.
    let window = app_window();
    for (command, body) in [
        ("secret_get", json!({"name": "not a name"})),
        ("secret_set", json!({"name": "not a name", "value": "v"})),
        ("secret_delete", json!({"name": "not a name"})),
    ] {
        let answer = invoke(&window, CONNECT_PAGE, command, body);
        let refusal = answer.expect_err("the name is invalid");
        assert_eq!(refusal["kind"], "invalid_name", "{command}: {refusal}");
    }
}

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

#[test]
fn served_page_test_sees_trust_granted_to_the_local_main_window_only() {
    // Trust must never reach a remote page or another window: the served
    // Studio could then open folders by asking the person.
    let text = include_str!("../capabilities/desktop-trust.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-pick-folder",
            "allow-trust-get",
            "allow-trust-list",
            "allow-trust-grant",
            "allow-trust-revoke"
        ])
    );
}
