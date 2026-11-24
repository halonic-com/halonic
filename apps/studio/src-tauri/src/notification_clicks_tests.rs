//! A notification click reaches the app window as one event naming the item.

use std::sync::{Arc, Mutex};

use serde_json::{Map, Value, json};
use tauri::Listener;
use tauri::test::{mock_builder, mock_context, noop_assets};

use super::{NOTIFICATION_CLICKED_EVENT, report_click};

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
