//! The served Studio gets no native access (HAL-196 section 3, Julian's
//! checklist): every app and plugin command the shell knows is refused when
//! the request comes from the computer's address, while the connect page
//! may still call `connect` and, on desktop, `git`, the `secret_*`
//! commands, `pick_folder`, the `trust_*` commands, the `run_*` commands,
//! the `agent_host_*` commands and the `fs_*` commands.

use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder};
use tauri::webview::{InvokeRequest, WebviewWindow};

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
        "secret_set",
        "secret_delete",
        "pick_folder",
        "trust_get",
        "trust_list",
        "trust_grant",
        "trust_revoke",
        "run_append",
        "run_events",
        "run_snapshot",
        "run_logs",
        "agent_host_request",
        "agent_host_stream",
        "agent_host_stream_end",
        "fs_list",
        "fs_read",
        "fs_write",
        "fs_remove",
        "fs_watch",
        "fs_unwatch",
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

#[cfg(desktop)]
#[test]
fn served_page_test_sees_the_connect_page_allowed_the_run_commands_on_desktop() {
    // Each call gets through to its command, which refuses the workspace
    // before it reads or writes anything: no folder is opened yet.
    let window = app_window();
    let folder = json!({"workspace": ".", "deployment": null});
    let run = json!({"workspace": ".", "deployment": null, "runId": "r1"});
    let append = json!({
        "workspace": ".",
        "deployment": null,
        "runId": "r1",
        "expectedSeq": 0,
        "lines": "{}\n",
        "snapshot": null,
    });
    for (command, body) in [
        ("run_append", append),
        ("run_events", run.clone()),
        ("run_snapshot", run),
        ("run_logs", folder),
    ] {
        let answer = invoke(&window, CONNECT_PAGE, command, body);
        let refusal = answer.expect_err("no folder is opened yet");
        assert_eq!(refusal["kind"], "folder_not_open", "{command}: {refusal}");
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
        ("fs_remove", file),
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
            "allow-fs-unwatch"
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
            "allow-agent-host-stream-end"
        ])
    );
}

#[test]
fn served_page_test_sees_runs_granted_to_the_local_main_window_only() {
    // A remote page must never reach the runs: the served Studio could
    // then read every run of every opened workspace.
    let text = include_str!("../capabilities/desktop-runs.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-run-append",
            "allow-run-events",
            "allow-run-snapshot",
            "allow-run-logs"
        ])
    );
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
