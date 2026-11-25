//! The served page and the engine commands: the connect page may call the
//! engine on desktop, and no remote page may.

use serde_json::{Value, json};

#[cfg(desktop)]
use super::{CONNECT_PAGE, app_window, invoke};

#[cfg(desktop)]
#[test]
fn served_page_test_sees_the_connect_page_allowed_the_engine_commands_on_desktop() {
    // The call gets through to the command, which refuses a name that isn't
    // one of the engine's routes before it looks for an engine.
    let window = app_window();
    let answer = invoke(
        &window,
        CONNECT_PAGE,
        "engine_request",
        json!({"route": "GET http://example.com/", "call": 1, "params": null, "body": null}),
    );
    let refusal = answer.expect_err("not a route");
    assert_eq!(refusal["kind"], "unknown_route", "{refusal}");
    let answer = invoke(
        &window,
        CONNECT_PAGE,
        "engine_chat_stream",
        json!({"route": "POST /api/runs", "stream": 7, "body": null, "channel": "__CHANNEL__:1"}),
    );
    let refusal = answer.expect_err("not a chat turn");
    assert_eq!(refusal["kind"], "unknown_route", "{refusal}");
    let ended = invoke(
        &window,
        CONNECT_PAGE,
        "engine_stream_end",
        json!({"stream": 7}),
    );
    assert_eq!(ended, Ok(Value::Null));
    let ended = invoke(
        &window,
        CONNECT_PAGE,
        "engine_request_end",
        json!({"call": 1}),
    );
    assert_eq!(ended, Ok(Value::Null));
}

/// `studio.src-tauri.engine-lifetime`: a folder the shell hasn't opened, in
/// any window, is refused before anything starts.
#[cfg(desktop)]
#[test]
fn engine_lifetime_engine_open_refuses_a_folder_the_shell_has_not_opened() {
    let window = app_window();
    let answer = invoke(
        &window,
        CONNECT_PAGE,
        "engine_open",
        json!({"workspace": "acme-not-opened"}),
    );
    let refusal = answer.expect_err("not an opened folder");
    assert_eq!(refusal["kind"], "folder_not_open", "{refusal}");
}

#[test]
fn served_page_test_sees_the_engine_granted_to_the_local_main_window_only() {
    // A remote page must never reach the engine: the served Studio could
    // then start and answer runs on this computer.
    let text = include_str!("../../capabilities/desktop-engine.json");
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
            "allow-engine-request",
            "allow-engine-request-end",
            "allow-engine-stream",
            "allow-engine-chat-stream",
            "allow-engine-stream-end",
            "allow-engine-open"
        ])
    );
}
