//! A notification click reaches the window its item belongs to as one event
//! naming the item.

use std::sync::{Arc, Mutex};

use serde_json::{Map, Value, json};
use tauri::test::{mock_builder, mock_context, noop_assets};
use tauri::webview::WebviewWindowBuilder;
use tauri::{Listener, Manager, WebviewUrl};

use super::{NOTIFICATION_CLICKED_EVENT, report_action, report_click};
use tauri_plugin_notification::ActionPerformed;

fn extra(value: Value) -> Map<String, Value> {
    value.as_object().cloned().expect("an object")
}

/// The windows that got the click event, each with the payload it carried,
/// after `click` ran on a mock app with the windows labelled `open`.
fn received_after(
    open: &[&str],
    click: impl FnOnce(&tauri::AppHandle<tauri::test::MockRuntime>),
) -> Vec<(String, String)> {
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("the mock app builds");
    let seen = Arc::new(Mutex::new(Vec::new()));
    for label in open {
        let window = WebviewWindowBuilder::new(&app, *label, WebviewUrl::default())
            .build()
            .expect("the window opens");
        let sink = Arc::clone(&seen);
        let receiver = (*label).to_owned();
        window.listen(NOTIFICATION_CLICKED_EVENT, move |event| {
            sink.lock()
                .expect("not poisoned")
                .push((receiver.clone(), event.payload().to_owned()));
        });
    }
    click(app.handle());
    // The guard is dropped inside `map`, before `seen` goes out of scope.
    seen.lock()
        .map(|received| received.clone())
        .expect("not poisoned")
}

/// The payloads the click event carried while only Studio's window was open.
fn events_after(click: impl FnOnce(&tauri::AppHandle<tauri::test::MockRuntime>)) -> Vec<String> {
    received_after(&["main"], click)
        .into_iter()
        .map(|(_, payload)| payload)
        .collect()
}

/// The windows that got a click on an item of `kind` while `open` were open.
fn receivers_of(kind: &str, open: &[&str]) -> Vec<String> {
    let clicked = extra(json!({ "messagingId": "item-acme-7", "kind": kind }));
    received_after(open, |app| report_click(app, &clicked).expect("sent"))
        .into_iter()
        .map(|(window, _)| window)
        .collect()
}

#[test]
fn a_click_goes_to_the_window_its_item_belongs_to() {
    let all = ["main", "inbox", "messenger"];
    assert_eq!(receivers_of("inbox-item", &all), ["inbox"]);
    assert_eq!(receivers_of("conversation", &all), ["messenger"]);
    assert_eq!(receivers_of("work", &all), ["main"]);
}

#[test]
fn a_click_reaches_the_app_window_while_only_it_is_open() {
    assert_eq!(receivers_of("work", &["inbox"]), ["inbox"]);
    assert_eq!(receivers_of("conversation", &["inbox"]), ["inbox"]);
    assert_eq!(receivers_of("inbox-item", &["main", "messenger"]), ["main"]);
}

#[test]
fn a_click_while_no_window_is_open_sends_nothing() {
    assert!(receivers_of("inbox-item", &[]).is_empty());
}

#[test]
fn a_click_sends_the_item_id() {
    let events = events_after(|app| {
        report_click(app, &extra(json!({ "messagingId": "item-acme-7" }))).expect("sent");
    });
    assert_eq!(events, vec![r#"{"messagingId":"item-acme-7"}"#.to_owned()]);
}

#[test]
fn a_notification_without_an_item_sends_nothing() {
    let events = events_after(|app| {
        report_click(app, &extra(json!({}))).expect("nothing to send");
        report_click(app, &extra(json!({ "messagingId": "" }))).expect("nothing to send");
        report_click(app, &extra(json!({ "messagingId": 7 }))).expect("nothing to send");
    });
    assert!(events.is_empty(), "{events:?}");
}

#[test]
fn a_click_sends_the_item_kind_along() {
    let events = events_after(|app| {
        let named = extra(json!({ "messagingId": "item-acme-7", "kind": "inbox-item" }));
        report_click(app, &named).expect("sent");
    });
    assert_eq!(
        events,
        vec![r#"{"messagingId":"item-acme-7","kind":"inbox-item"}"#.to_owned()]
    );
}

/// What the plugin hands its handlers for `action` on a notification with `extra`.
fn performed(action: &str, extra: Value) -> ActionPerformed {
    serde_json::from_value(json!({
        "actionId": action,
        "notification": { "id": 1, "extra": extra },
    }))
    .expect("an action")
}

#[test]
fn a_tap_from_the_plugin_sends_the_item() {
    let events = events_after(|app| {
        let tap = performed(
            "tap",
            json!({ "messagingId": "chat-acme-2", "kind": "conversation" }),
        );
        report_action(app, &tap).expect("sent");
    });
    assert_eq!(
        events,
        vec![r#"{"messagingId":"chat-acme-2","kind":"conversation"}"#.to_owned()]
    );
}

#[test]
fn a_button_or_an_undescribed_tap_sends_nothing() {
    let events = events_after(|app| {
        let button = performed("snooze", json!({ "messagingId": "item-acme-7" }));
        report_action(app, &button).expect("nothing to send");
        let bare: ActionPerformed =
            serde_json::from_value(json!({ "actionId": "tap" })).expect("an action");
        report_action(app, &bare).expect("nothing to send");
    });
    assert!(events.is_empty(), "{events:?}");
}

#[test]
fn a_click_on_a_run_goes_to_studio_even_with_the_apps_open() {
    let all = ["main", "inbox", "messenger"];
    assert_eq!(receivers_of("run", &all), ["main"]);
    assert_eq!(receivers_of("runs-failed", &["inbox", "main"]), ["main"]);
}

/// `studio.src-tauri.run-notification-cold-open`
#[test]
fn a_click_on_a_run_after_a_start_at_login_opens_studio_with_the_windows_of_the_last_quit() {
    let app = crate::shell(mock_builder())
        .build(tauri::generate_context!())
        .expect("the shell builds on the mock runtime");
    // Only the Inbox, focused, and the Messenger were open at the last quit.
    crate::open_windows_track::seed(
        app.handle(),
        &[
            crate::open_windows::OpenWindow {
                label: "inbox".to_owned(),
                focused: true,
                content: None,
            },
            crate::open_windows::OpenWindow {
                label: "messenger".to_owned(),
                focused: false,
                content: None,
            },
        ],
    );
    let failed = extra(json!({ "messagingId": "runs-failed-acme", "kind": "runs-failed" }));
    report_click(app.handle(), &failed).expect("Studio opens");
    let mut labels: Vec<String> = app.webview_windows().into_keys().collect();
    labels.sort();
    assert_eq!(labels, ["inbox", "main", "messenger"]);
    let waiting = super::pending_click::take_pending_notification_click(
        app.state::<super::pending_click::PendingClick>(),
    )
    .expect("taken");
    assert!(waiting.is_some(), "Studio's page takes the click");
}

#[test]
fn a_click_on_a_run_opens_studio_while_only_an_app_is_open() {
    let app = crate::shell(mock_builder())
        .build(tauri::generate_context!())
        .expect("the shell builds on the mock runtime");
    WebviewWindowBuilder::new(&app, "inbox", WebviewUrl::default())
        .build()
        .expect("the window opens");
    let failed = extra(json!({ "messagingId": "runs-failed-acme", "kind": "runs-failed" }));
    report_click(app.handle(), &failed).expect("Studio opens");
    let mut labels: Vec<String> = app.webview_windows().into_keys().collect();
    labels.sort();
    assert_eq!(labels, ["inbox", "main"]);
}
