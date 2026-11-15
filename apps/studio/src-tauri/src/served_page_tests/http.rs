//! The served page and the `http_request` command: the connect page may send a
//! request to a model provider on desktop, and no remote page may.

use serde_json::{Value, json};

#[cfg(desktop)]
use super::{CONNECT_PAGE, app_window, invoke};

#[cfg(desktop)]
#[test]
fn served_page_test_sees_the_connect_page_allowed_http_request_on_desktop() {
    // The call gets through to the command, which refuses the host before
    // any network use.
    let window = app_window();
    let answer = invoke(
        &window,
        CONNECT_PAGE,
        "http_request",
        json!({"request": {"url": "https://example.com/", "method": "GET"}}),
    );
    let refusal = answer.expect_err("example.com is no provider host");
    assert_eq!(refusal["kind"], "host_refused", "{refusal}");
}

#[test]
fn served_page_test_sees_http_request_granted_to_the_local_main_window_only() {
    let text = include_str!("../../capabilities/desktop-http.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(capability["permissions"], json!(["allow-http-request"]));
}
