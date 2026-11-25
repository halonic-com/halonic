//! Requirement `run-notification-cold-open`: a run's click that opened
//! Studio's window waits for its page, which takes it once.

use std::sync::{Arc, Mutex};

use serde_json::{Map, Value, json};
use tauri::test::{MockRuntime, mock_builder};
use tauri::webview::WebviewWindowBuilder;
use tauri::{App, Listener, Manager, WebviewUrl};

use super::{PendingClick, hold, take_pending_notification_click};
use crate::notification_clicks::{NOTIFICATION_CLICKED_EVENT, NotificationClicked, report_click};

/// The shell on the mock runtime, with only the windows labelled `open`.
fn shell_with(open: &[&str]) -> App<MockRuntime> {
    let app = crate::shell(mock_builder())
        .build(tauri::generate_context!())
        .expect("the shell builds on the mock runtime");
    for label in open {
        WebviewWindowBuilder::new(&app, *label, WebviewUrl::default())
            .build()
            .expect("the window opens");
    }
    app
}

fn extra(value: Value) -> Map<String, Value> {
    value.as_object().cloned().expect("an object")
}

fn clicked(id: &str, kind: &str) -> NotificationClicked {
    NotificationClicked {
        messaging_id: id.to_owned(),
        kind: Some(kind.to_owned()),
    }
}

/// What the page's call of the command returns now.
fn take(app: &App<MockRuntime>) -> Option<NotificationClicked> {
    take_pending_notification_click(app.state::<PendingClick>()).expect("taken")
}

#[test]
fn a_cold_open_click_is_taken_once_then_none() {
    let app = shell_with(&["inbox"]);
    let heard = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&heard);
    app.listen_any(NOTIFICATION_CLICKED_EVENT, move |event| {
        sink.lock()
            .expect("not poisoned")
            .push(event.payload().to_owned());
    });
    let run = extra(json!({ "messagingId": "run-acme-7", "kind": "run" }));
    report_click(app.handle(), &run).expect("Studio opens");
    assert!(app.get_webview_window("main").is_some());
    assert!(heard.lock().expect("not poisoned").is_empty());
    assert_eq!(take(&app), Some(clicked("run-acme-7", "run")));
    assert_eq!(take(&app), None);
}

#[test]
fn a_newer_click_replaces_the_waiting_one() {
    let app = shell_with(&[]);
    hold(app.handle(), clicked("run-acme-1", "run"));
    hold(app.handle(), clicked("failed", "runs-failed"));
    assert_eq!(take(&app), Some(clicked("failed", "runs-failed")));
}

#[test]
fn a_click_of_another_kind_is_never_kept() {
    let app = shell_with(&[]);
    hold(app.handle(), clicked("chat-acme-2", "conversation"));
    hold(app.handle(), clicked("", "run"));
    hold(
        app.handle(),
        NotificationClicked {
            messaging_id: "run-acme-3".to_owned(),
            kind: None,
        },
    );
    assert_eq!(take(&app), None);
}

#[test]
fn an_open_studio_gets_the_event_and_keeps_nothing() {
    let app = shell_with(&["main"]);
    let run = extra(json!({ "messagingId": "run-acme-7", "kind": "run" }));
    report_click(app.handle(), &run).expect("sent");
    assert_eq!(take(&app), None);
}

#[test]
fn the_command_is_granted_to_studios_window_only_and_never_served() {
    let capability: Value = serde_json::from_str(include_str!(
        "../capabilities/desktop-pending-notification-click.json"
    ))
    .expect("the capability");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("remote").is_none());
    assert_eq!(
        capability["permissions"],
        json!(["allow-take-pending-notification-click"])
    );
}
