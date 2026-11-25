//! The served page and `server_session_open`: the connect page may call it
//! on macOS and Linux, and no remote page or other platform may.

use serde_json::{Value, json};

#[cfg(any(target_os = "macos", target_os = "linux"))]
use super::{CONNECT_PAGE, SERVED_PAGE, app_window, invoke};

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[test]
fn served_page_test_sees_the_connect_page_allowed_to_open_a_server_session() {
    // The call gets through to the command, which refuses the task id
    // before it reads the settings or asks the person.
    let window = app_window();
    let body = json!({"task": "HAL-1;x", "brief": "Task: x", "requestHash": "sha256-abc"});
    let answer = invoke(&window, CONNECT_PAGE, "server_session_open", body.clone());
    assert_eq!(
        answer,
        Ok(json!({"kind": "refused", "reason": "the task id isn't like HAL-1234"}))
    );
    let refusal = invoke(&window, SERVED_PAGE, "server_session_open", body)
        .expect_err("the served page is refused");
    assert!(refusal.to_string().contains("not allowed"), "{refusal}");
}

#[test]
fn served_page_test_sees_the_server_session_granted_to_the_local_main_window_only() {
    // A remote page must never reach it: the served Studio could then start
    // Claude Code with the user's server access.
    let text = include_str!("../../capabilities/desktop-server-session.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(capability["platforms"], json!(["linux", "macOS"]));
    assert_eq!(
        capability["permissions"],
        json!(["allow-server-session-open"])
    );
}
