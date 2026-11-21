//! The served Studio gets no native access (HAL-196 section 3, Julian's
//! checklist): every app and plugin command the shell knows is refused when
//! the request comes from the computer's address, while the connect page
//! may still call `connect` and, on desktop, `git`, the `secret_*`
//! commands, `pick_folder`, `documents_folder`, `pick_parent_folder`,
//! `create_workspace_folder`, the `trust_*` commands, the `host_settings_*`
//! commands, the `run_*` commands, the `agent_host_*` commands, the
//! `engine_*` commands, the `fs_*`
//! commands, the `blob_*` and `record_*` commands and the `update_*`
//! commands, and, on Android, `pair_scan` and `pair_scan_cancel`.

use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder};
use tauri::webview::{InvokeRequest, WebviewWindow};

use crate::shell;

mod device_keys;
mod engine;
mod engine_lock;
mod pair_scan;
mod runs;
#[cfg(desktop)]
mod secrets;
mod trust;
#[cfg(desktop)]
mod updates;

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
/// tauri.conf.json describes. The shell opens it in its setup, which runs
/// only when the app runs, so the test opens it the same way.
fn app_window() -> WebviewWindow<MockRuntime> {
    let app = shell(mock_builder())
        .build(tauri::generate_context!())
        .expect("the shell builds on the mock runtime");
    crate::window::open(&app).expect("the main window opens")
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
        "secret_has",
        "secret_set",
        "secret_delete",
        "secret_allowed_origins",
        "secret_allow_origin",
        "token_get",
        "token_set",
        "token_delete",
        "pick_folder",
        "documents_folder",
        "system_region",
        "pick_parent_folder",
        "create_workspace_folder",
        "probe_workspace_folder",
        "open_workspace_folder",
        "trust_get",
        "trust_list",
        "trust_folders_found",
        "trust_grant",
        "trust_revoke",
        "instruction_trust_get",
        "instruction_trust_save",
        "instruction_trust_remove",
        "reopen_folder",
        "forget_folder",
        "command_paths",
        "host_settings_read",
        "host_settings_set",
        "host_settings_remove",
        "run_append",
        "run_events",
        "run_snapshot",
        "run_logs",
        "engine_lock_hold",
        "engine_lock_release",
        "blob_put",
        "blob_get",
        "record_append",
        "record_read",
        "record_replace",
        "google_setup_read",
        "workspace_key",
        "resource_report",
        "lite_check",
        "sandbox_elevate",
        "pair_scan",
        "pair_scan_cancel",
        "agent_host_request",
        "agent_host_stream",
        "agent_host_stream_end",
        "agent_host_security_updates",
        "agent_host_sandbox_choice_save",
        "engine_ready",
        "start_status",
        "engine_request",
        "engine_stream",
        "engine_stream_end",
        "http_fetch",
        "http_fetch_abort",
        "fs_list",
        "fs_read",
        "fs_write",
        "fs_remove",
        "fs_watch",
        "fs_unwatch",
        "folder_entries",
        "folder_read",
        "folder_location",
        "plugin:opener|open_url",
        "plugin:event|listen",
    ] {
        assert!(
            commands.iter().any(|command| command == expected),
            "{expected} missing from {commands:?}"
        );
    }
    #[cfg(desktop)]
    for expected in [
        "update_status",
        "update_watch",
        "update_check",
        "update_download",
        "update_cancel",
        "update_restart",
        "update_set_automatic",
        "plugin:updater|check",
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
fn no_page_may_ask_for_the_local_network_permission() {
    // Only the shell's `connect` asks, from Rust (HAL-12253). The plugin is
    // registered on Android only, but the ACL refuses its command anywhere.
    let window = app_window();
    for from in [CONNECT_PAGE, SERVED_PAGE] {
        for command in [
            "plugin:local-network|allow_local_network",
            "plugin:local-network|allowLocalNetwork",
            "plugin:local-network|request_permissions",
        ] {
            assert!(
                invoke(&window, from, command, json!({})).is_err(),
                "{command} must be refused from {from}"
            );
        }
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
fn served_page_test_sees_the_connect_page_allowed_to_fetch_on_desktop() {
    let window = app_window();
    let request = json!({"request": {"method": "TRACE", "url": "https://example.com/"}, "call": 1});
    let refusal = invoke(&window, CONNECT_PAGE, "http_fetch", request).expect_err("method refused");
    assert_eq!(refusal["kind"], "method_refused", "{refusal}");
    let aborted = invoke(
        &window,
        CONNECT_PAGE,
        "http_fetch_abort",
        json!({"call": 1}),
    );
    assert_eq!(aborted, Ok(Value::Null));
}

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

#[cfg(desktop)]
#[test]
fn served_page_test_sees_the_connect_page_allowed_the_blob_and_record_commands_on_desktop() {
    // Each call gets through to its command, which refuses the workspace
    // before it reads or writes anything: no folder is opened yet.
    let window = app_window();
    let hash = "0".repeat(64);
    for (command, body) in [
        ("blob_put", json!({"workspace": ".", "data": "aGVsbG8"})),
        ("blob_get", json!({"workspace": ".", "hash": hash})),
        ("record_append", json!({"workspace": ".", "appends": []})),
        (
            "record_read",
            json!({"workspace": ".", "collection": "leads"}),
        ),
        (
            "record_replace",
            json!({"workspace": ".", "collection": "leads", "version": "", "lines": ""}),
        ),
    ] {
        let answer = invoke(&window, CONNECT_PAGE, command, body);
        let refusal = answer.expect_err("no folder is opened yet");
        assert_eq!(refusal["kind"], "folder_not_open", "{command}: {refusal}");
    }
}

#[test]
fn served_page_test_sees_blobs_and_records_granted_to_the_local_main_window_only() {
    // A remote page must never reach the blobs or records: the served
    // Studio could then read every opened workspace's data.
    for (text, permissions) in [
        (
            include_str!("../capabilities/desktop-blobs.json"),
            json!(["allow-blob-put", "allow-blob-get"]),
        ),
        (
            include_str!("../capabilities/desktop-records.json"),
            json!([
                "allow-record-append",
                "allow-record-read",
                "allow-record-replace"
            ]),
        ),
    ] {
        let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
        assert_eq!(capability["local"], true);
        assert_eq!(capability["windows"], json!(["main"]));
        assert!(capability.get("remote").is_none(), "{capability}");
        assert_eq!(capability["permissions"], permissions);
    }
}

#[cfg(desktop)]
#[test]
fn served_page_test_sees_the_connect_page_allowed_the_agent_host_commands_on_desktop() {
    // The call gets through to the command, which refuses a name that isn't
    // one of the host's routes before it starts the host.
    let window = app_window();
    let answer = invoke(
        &window,
        CONNECT_PAGE,
        "agent_host_request",
        json!({"route": "GET http://example.com/", "body": null}),
    );
    let refusal = answer.expect_err("not a route");
    assert_eq!(refusal["kind"], "unknown_route", "{refusal}");
    let ended = invoke(
        &window,
        CONNECT_PAGE,
        "agent_host_stream_end",
        json!({"stream": 7}),
    );
    assert_eq!(ended, Ok(Value::Null));
    // A backend that isn't one of the port's is refused before anything is saved.
    let saved = invoke(
        &window,
        CONNECT_PAGE,
        "agent_host_sandbox_choice_save",
        json!({"backend": "docker"}),
    );
    let refusal = saved.expect_err("not a backend");
    assert_eq!(refusal["kind"], "invalid_choice", "{refusal}");
}

#[cfg(desktop)]
#[test]
fn served_page_test_sees_the_connect_page_allowed_the_file_commands_on_desktop() {
    // Each call gets through to its command, which refuses the workspace
    // before it reads or writes anything: no folder is opened yet.
    let window = app_window();
    let file = json!({"workspace": ".", "path": "a.yaml"});
    let write = json!({"workspace": ".", "path": "a.yaml", "text": "x", "expected": null});
    for (command, body) in [
        ("fs_list", json!({"workspace": ".", "dir": null})),
        ("fs_read", file.clone()),
        ("fs_write", write),
        ("fs_remove", file.clone()),
        ("folder_entries", json!({"workspace": ".", "dir": null})),
        ("folder_read", file),
        ("folder_location", json!({"workspace": ".", "path": null})),
    ] {
        let answer = invoke(&window, CONNECT_PAGE, command, body);
        let refusal = answer.expect_err("no folder is opened yet");
        assert_eq!(refusal["kind"], "folder_not_open", "{command}: {refusal}");
    }
    let ended = invoke(&window, CONNECT_PAGE, "fs_unwatch", json!({"watchId": 7}));
    assert_eq!(ended, Ok(Value::Null));
}

#[test]
fn served_page_test_sees_files_granted_to_the_local_main_window_only() {
    // A remote page must never reach the files: the served Studio could
    // then read and change every opened workspace.
    let text = include_str!("../capabilities/desktop-files.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
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
    let text = include_str!("../capabilities/desktop-agent-host.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-agent-host-request",
            "allow-agent-host-stream",
            "allow-agent-host-stream-end",
            "allow-agent-host-security-updates",
            "allow-agent-host-sandbox-choice-save",
            "allow-engine-ready",
            "allow-start-status"
        ])
    );
}

#[test]
fn served_page_test_sees_host_settings_granted_to_the_local_main_window_only() {
    // The served Studio may show the settings, but only through the
    // computer's own server; it must never change them through the shell.
    let text = include_str!("../capabilities/desktop-host-settings.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
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
