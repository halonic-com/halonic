//! The served page and the phone tunnel (HAL-15157 and HAL-15177; H1 and
//! L3 on HAL-15181, B7 items 8 and 9 of the D7 design on HAL-15159): only
//! the phone's own page may call the `phone_*` and `tunnel_*` commands (the
//! saved Inbox and Messenger's `phone_saved_*` too, HAL-19026), on
//! Android only, and the tunnel's events, statuses, sessions and host
//! messages alike, reach only the app's own page, never the Studio a
//! computer serves into the same window.

use std::sync::{Arc, Mutex};

use halonic_connect::parse_address;
use halonic_phone_tunnel::{PageStatus, Reason};
use serde_json::{Value, json};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::test::MockRuntime;
use tauri::{AppHandle, Manager, Url, Webview};

use super::{CONNECT_PAGE, SERVED_PAGE, app_window, invoke};
use crate::navigation::{ConfirmedAddress, on_navigation};
use crate::phone_tunnel_events::{TunnelEvent, end_page_watch, tell, watch, watching};

const COMMANDS: [&str; 13] = [
    "phone_pair_start",
    "phone_pair_wait",
    "phone_pair_cancel",
    "phone_computers",
    "phone_forget",
    "phone_connect",
    "phone_disconnect",
    "phone_tunnel_watch",
    "tunnel_send",
    "tunnel_end_session",
    "phone_saved_read",
    "phone_saved_write",
    "phone_saved_clear",
];

/// The app's own page on this platform, which the window opens.
const APP_PAGE: &str = if cfg!(target_os = "android") {
    "http://tauri.localhost/connect.html"
} else if cfg!(windows) {
    "http://tauri.localhost/studio.html"
} else {
    "tauri://localhost/studio.html"
};

#[test]
fn served_page_is_refused_the_phone_tunnel() {
    let window = app_window();
    for command in COMMANDS {
        let refusal = invoke(&window, SERVED_PAGE, command, json!({}))
            .expect_err("the served page has no phone tunnel");
        assert!(
            refusal.to_string().contains("not allowed"),
            "{command} failed for another reason: {refusal}"
        );
    }
}

#[cfg(desktop)]
#[test]
fn served_page_test_sees_no_page_allowed_the_phone_tunnel_on_desktop() {
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
fn served_page_test_sees_the_phone_tunnel_granted_to_the_phone_s_own_page_only() {
    let text = include_str!("../../capabilities/phone-tunnel.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert_eq!(capability["platforms"], json!(["android"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    let permissions: Vec<String> = COMMANDS
        .iter()
        .map(|command| format!("allow-{}", command.replace('_', "-")))
        .collect();
    assert_eq!(capability["permissions"], json!(permissions));
}

#[test]
fn no_page_may_ask_for_the_phone_s_name() {
    // Only the shell asks, from Rust, when it starts a pairing. The plugin
    // is registered on Android only, but the ACL refuses it anywhere.
    let window = app_window();
    for from in [CONNECT_PAGE, SERVED_PAGE] {
        for command in [
            "plugin:phone-tunnel|phoneName",
            "plugin:phone-tunnel|phone_name",
            "plugin:phone-name|phoneName",
        ] {
            assert!(
                invoke(&window, from, command, json!({})).is_err(),
                "{command} must be refused from {from}"
            );
        }
    }
}

/// A channel that keeps what it is sent.
fn recording() -> (Channel<TunnelEvent>, Arc<Mutex<Vec<Value>>>) {
    let sent = Arc::new(Mutex::new(Vec::new()));
    let kept = Arc::clone(&sent);
    let channel = Channel::new(move |body| {
        if let InvokeResponseBody::Json(text) = body {
            kept.lock()
                .unwrap()
                .push(serde_json::from_str(&text).expect("JSON"));
        }
        Ok(())
    });
    (channel, sent)
}

fn status(status: PageStatus) -> TunnelEvent {
    TunnelEvent::Status {
        computer: "desk".to_owned(),
        status,
    }
}

fn session_opened() -> TunnelEvent {
    TunnelEvent::SessionOpened {
        computer: "desk".to_owned(),
        generation: 7,
    }
}

fn message() -> TunnelEvent {
    TunnelEvent::Message {
        computer: "desk".to_owned(),
        generation: 7,
        text: r#"{"type":"welcome","replyTo":"h1","version":2}"#.to_owned(),
    }
}

fn reconnecting() -> TunnelEvent {
    status(PageStatus::Reconnecting {
        last_try: Some(Reason::Timeout),
        next_try_at_ms: Some(5_000),
    })
}

fn go(webview: &Webview<MockRuntime>, url: &str) {
    webview
        .navigate(url.parse().expect("a test URL"))
        .expect("the mock webview navigates");
}

/// The shell with its window on the app's own page, and its webview.
fn on_app_page() -> (AppHandle<MockRuntime>, Webview<MockRuntime>) {
    let window = app_window();
    let app = window.app_handle().clone();
    let webview: Webview<MockRuntime> = app
        .get_webview_window("main")
        .expect("the main window")
        .as_ref()
        .clone();
    go(&webview, APP_PAGE);
    (app, webview)
}

#[test]
fn phone_tunnel_commands_send_the_app_s_own_page_the_current_status_first() {
    let (app, webview) = on_app_page();
    let (channel, sent) = recording();
    assert!(watch(
        &webview,
        channel,
        vec![status(PageStatus::Connecting)]
    ));
    tell(&app, &reconnecting());
    assert_eq!(
        *sent.lock().unwrap(),
        vec![
            json!({ "kind": "status", "computer": "desk", "status": { "state": "connecting" } }),
            json!({
                "kind": "status",
                "computer": "desk",
                "status": { "state": "reconnecting", "lastTry": "timeout", "nextTryAtMs": 5000 },
            }),
        ]
    );
}

#[test]
fn phone_tunnel_commands_send_sessions_and_messages_with_exactly_their_fields() {
    let (app, webview) = on_app_page();
    let (channel, sent) = recording();
    assert!(watch(&webview, channel, vec![session_opened()]));
    tell(&app, &message());
    assert_eq!(
        *sent.lock().unwrap(),
        vec![
            json!({ "kind": "session-opened", "computer": "desk", "generation": 7 }),
            json!({
                "kind": "message",
                "computer": "desk",
                "generation": 7,
                "text": r#"{"type":"welcome","replyTo":"h1","version":2}"#,
            }),
        ]
    );
}

#[test]
fn phone_tunnel_commands_send_no_event_once_the_window_is_on_the_served_page() {
    for event in [status(PageStatus::Connected), session_opened(), message()] {
        let (app, webview) = on_app_page();
        let (channel, sent) = recording();
        assert!(watch(&webview, channel, Vec::new()));

        // The window moves on without asking the guard, as Android's
        // WebView does for a form sent with POST: the next event finds it
        // on the served page, isn't sent, and drops the channel.
        go(&webview, SERVED_PAGE);
        tell(&app, &event);
        assert!(sent.lock().unwrap().is_empty(), "{event:?}");
        assert_eq!(watching(&app), 0);

        // Back on the app's own page, the dropped channel stays dropped:
        // the page watches again.
        go(&webview, APP_PAGE);
        tell(&app, &event);
        assert!(sent.lock().unwrap().is_empty(), "{event:?}");
    }
}

#[test]
fn phone_tunnel_commands_send_no_event_while_the_window_leaves() {
    let (app, webview) = on_app_page();
    let confirmed = parse_address("192.168.1.20:4280").expect("the served address");
    app.state::<ConfirmedAddress>().set(Some(confirmed));
    let (channel, sent) = recording();
    assert!(watch(&webview, channel, Vec::new()));

    // The guard lets the window go to the confirmed address. The window is
    // still on the app's own page, but the channel is already gone, so an
    // event sent in between reaches no page.
    let served: Url = SERVED_PAGE.parse().expect("a test URL");
    assert!(on_navigation(&webview, &served));
    assert_eq!(watching(&app), 0);
    for event in [status(PageStatus::Connected), session_opened(), message()] {
        tell(&app, &event);
    }
    assert!(sent.lock().unwrap().is_empty());
}

#[test]
fn phone_tunnel_commands_keep_the_channel_while_the_window_stays_home() {
    let (app, webview) = on_app_page();
    let (channel, sent) = recording();
    assert!(watch(&webview, channel, Vec::new()));
    let home: Url = APP_PAGE.parse().expect("a test URL");
    assert!(on_navigation(&webview, &home));
    tell(&app, &status(PageStatus::Connected));
    assert_eq!(sent.lock().unwrap().len(), 1);

    // A page that reloads or closes loses its channel (lib.rs calls this).
    end_page_watch(&app, webview.label());
    tell(&app, &status(PageStatus::Closed));
    assert_eq!(sent.lock().unwrap().len(), 1);
}

#[test]
fn phone_tunnel_commands_refuse_a_watch_from_the_served_page() {
    let (app, webview) = on_app_page();
    go(&webview, SERVED_PAGE);
    let (channel, sent) = recording();
    assert!(!watch(
        &webview,
        channel,
        vec![status(PageStatus::Connected), session_opened()]
    ));
    assert!(sent.lock().unwrap().is_empty());
    assert_eq!(watching(&app), 0);
}
