//! A notification click reaches the app window as one event naming the item.

use std::sync::{Arc, Mutex};

use serde_json::{Map, Value, json};
use tauri::Listener;
use tauri::test::{mock_builder, mock_context, noop_assets};

use super::{NOTIFICATION_CLICKED_EVENT, report_action, report_click};
use tauri_plugin_notification::ActionPerformed;

fn extra(value: Value) -> Map<String, Value> {
    value.as_object().cloned().expect("an object")
}

/// The payloads the click event carried, after `click` ran on a mock app.
fn events_after(click: impl FnOnce(&tauri::AppHandle<tauri::test::MockRuntime>)) -> Vec<String> {
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("the mock app builds");
    let seen = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&seen);
    app.listen_any(NOTIFICATION_CLICKED_EVENT, move |event| {
        sink.lock()
            .expect("not poisoned")
            .push(event.payload().to_owned());
    });
    click(app.handle());
    // The guard is dropped inside `map`, before `seen` goes out of scope.
    seen.lock()
        .map(|payloads| payloads.clone())
        .expect("not poisoned")
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
