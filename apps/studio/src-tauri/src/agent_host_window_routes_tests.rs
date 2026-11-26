//! Requirement `studio.src-tauri.quick-ask-window`: from the box's window,
//! `agent_host_request` reaches the host only for the three messaging
//! routes its page calls, while Studio's and Messenger's windows keep the
//! host's whole table. Against the stand-in host of `agent_host_tests.rs`.

use serde_json::json;
use tauri::test::MockRuntime;
use tauri::webview::WebviewWindowBuilder;
use tauri::{Webview, WebviewUrl};

use super::{
    AfterHandshake, FakeHost, HostAnswer, HostRefusal, Seen, Shell, agent_host_request, as_json,
    page,
};

fn window(shell: &Shell, label: &str) -> Webview<MockRuntime> {
    let window = WebviewWindowBuilder::new(&shell.app, label, WebviewUrl::default())
        .build()
        .expect("the window opens");
    window.as_ref().clone()
}

fn request_from(webview: &Webview<MockRuntime>, route: &str) -> Result<HostAnswer, HostRefusal> {
    let body = route.starts_with("POST").then(|| json!({}));
    tauri::async_runtime::block_on(agent_host_request(webview.clone(), route.to_owned(), body))
}

/// Calls `route` from `webview` and checks that it reached the host.
fn reaches_the_host(fake: &FakeHost, webview: &Webview<MockRuntime>, route: &str) {
    if let Err(refusal) = request_from(webview, route) {
        panic!("{route} from {}: {}", webview.label(), as_json(&refusal));
    }
    let Seen::Request { route: seen, .. } = fake.next() else {
        panic!("a request");
    };
    assert_eq!(seen, route);
}

#[test]
fn the_box_reaches_only_the_three_messaging_routes_its_page_calls() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    let ask = window(&shell, "ask");

    for route in [
        "POST /v1/messaging/read",
        "POST /v1/messaging/send",
        "POST /v1/messaging/changes",
    ] {
        reaches_the_host(&fake, &ask, route);
    }
    for route in [
        "GET /v1/health",
        "POST /v1/messaging/answer",
        "POST /v1/messaging/focus",
        "POST /v1/paperclip/key",
        "POST /v1/sandbox/sessions/open",
        "POST /v1/sandbox/remove",
        "POST /v1/harnesses/runs/send",
        "POST /v1/plugins/call",
        "POST /v1/connectors/call",
        "POST /v1/google/secret",
        "POST /v1/unfenced-runs/allow",
        "POST /v1/remote/pairing/answer",
        "GET http://example.com/",
    ] {
        let refusal = request_from(&ask, route).expect_err("the box may not call it");
        let refusal = as_json(&refusal);
        assert!(
            refusal.contains(r#""kind":"not_for_the_box""#),
            "{route}: {refusal}"
        );
    }
    assert!(
        fake.seen.try_recv().is_err(),
        "no refused route reached the host"
    );
}

#[test]
fn studio_and_messenger_keep_the_hosts_whole_table() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    let messenger = window(&shell, "messenger");
    let studio = page(&shell.handle());

    for webview in [&studio, &messenger] {
        for route in [
            "POST /v1/messaging/read",
            "POST /v1/messaging/answer",
            "GET /v1/health",
            "POST /v1/sandbox/sessions/open",
        ] {
            reaches_the_host(&fake, webview, route);
        }
    }
}

/// `FocusedApp` is desktop only, so the route check names the box's label
/// itself; this keeps the two the same.
#[cfg(desktop)]
#[test]
fn the_route_check_names_the_boxs_window() {
    use crate::focused_apps::FocusedApp;

    assert_eq!(
        super::super::window_routes::BOX_WINDOW,
        FocusedApp::Ask.name()
    );
}
