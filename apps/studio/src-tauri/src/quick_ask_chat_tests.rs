//! Requirement `studio.src-tauri.quick-ask-chat`.

use std::sync::{Arc, Mutex};

use serde_json::{Value, json};
use tauri::test::{MockRuntime, mock_builder};
use tauri::webview::WebviewWindowBuilder;
use tauri::{App, Listener, Manager, Webview, WebviewUrl};

use super::{HeldChat, open_chat, take_chat};
use crate::notification_clicks::{NOTIFICATION_CLICKED_EVENT, NotificationClicked};

/// The shell on the mock runtime, with only the windows labelled `open`.
fn app_with(open: &[&str]) -> App<MockRuntime> {
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

fn webview(app: &App<MockRuntime>, label: &str) -> Webview<MockRuntime> {
    let window = app.get_webview_window(label).expect("the window is open");
    let webview: &Webview<MockRuntime> = window.as_ref();
    webview.clone()
}

/// What `open_chat` answers the window labelled `from` for `conversation`.
fn open_from(app: &App<MockRuntime>, from: &str, conversation: &str) -> Result<(), &'static str> {
    tauri::async_runtime::block_on(open_chat(
        app.handle().clone(),
        webview(app, from),
        conversation.to_owned(),
    ))
}

/// What `take_chat` answers the window labelled `from`.
fn take_from(
    app: &App<MockRuntime>,
    from: &str,
) -> Result<Option<NotificationClicked>, &'static str> {
    take_chat(webview(app, from), app.state::<HeldChat>())
}

/// Every `notification-clicked` payload any window hears from now on.
fn heard(app: &App<MockRuntime>) -> Arc<Mutex<Vec<String>>> {
    let heard = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&heard);
    app.listen_any(NOTIFICATION_CLICKED_EVENT, move |event| {
        sink.lock()
            .expect("not poisoned")
            .push(event.payload().to_owned());
    });
    heard
}

fn chat(id: &str) -> NotificationClicked {
    NotificationClicked {
        messaging_id: id.to_owned(),
        kind: Some("conversation".to_owned()),
    }
}

#[test]
fn a_closed_messenger_opens_and_its_page_takes_the_chat_once() {
    let app = app_with(&["main", "ask"]);
    let heard = heard(&app);
    assert_eq!(open_from(&app, "ask", "chat-acme-chief"), Ok(()));
    assert!(app.get_webview_window("messenger").is_some());
    assert!(heard.lock().expect("not poisoned").is_empty());
    assert_eq!(
        take_from(&app, "messenger"),
        Ok(Some(chat("chat-acme-chief")))
    );
    assert_eq!(take_from(&app, "messenger"), Ok(None));
}

#[test]
fn an_open_messenger_hears_the_chat_as_a_conversation_click_and_keeps_nothing() {
    let app = app_with(&["ask", "messenger"]);
    let heard = heard(&app);
    assert_eq!(open_from(&app, "ask", "chat-acme-chief"), Ok(()));
    let payloads = heard.lock().expect("not poisoned").clone();
    let payloads: Vec<Value> = payloads
        .iter()
        .map(|payload| serde_json::from_str(payload).expect("JSON"))
        .collect();
    assert_eq!(
        payloads,
        [json!({ "messagingId": "chat-acme-chief", "kind": "conversation" })]
    );
    assert_eq!(take_from(&app, "messenger"), Ok(None));
}

#[test]
fn a_newer_chat_replaces_the_waiting_one() {
    let app = app_with(&["ask"]);
    super::keep(app.handle(), Some(chat("chat-acme-1")));
    super::keep(app.handle(), Some(chat("chat-acme-2")));
    WebviewWindowBuilder::new(&app, "messenger", WebviewUrl::default())
        .build()
        .expect("the window opens");
    assert_eq!(take_from(&app, "messenger"), Ok(Some(chat("chat-acme-2"))));
}

#[test]
fn only_the_box_hands_over_and_only_messenger_takes() {
    let app = app_with(&["main", "ask", "inbox"]);
    assert_eq!(
        open_from(&app, "main", "chat-acme-chief"),
        Err("not_the_box")
    );
    assert_eq!(
        open_from(&app, "inbox", "chat-acme-chief"),
        Err("not_the_box")
    );
    assert!(app.get_webview_window("messenger").is_none());
    assert_eq!(open_from(&app, "ask", ""), Err("invalid"));
    assert_eq!(open_from(&app, "ask", &"x".repeat(513)), Err("invalid"));
    assert!(app.get_webview_window("messenger").is_none());
    assert_eq!(open_from(&app, "ask", "chat-acme-chief"), Ok(()));
    assert_eq!(take_from(&app, "main"), Err("not_messenger"));
    assert_eq!(take_from(&app, "ask"), Err("not_messenger"));
    assert_eq!(
        take_from(&app, "messenger"),
        Ok(Some(chat("chat-acme-chief")))
    );
}

fn capability(text: &str) -> Value {
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert!(capability.get("remote").is_none(), "{capability}");
    capability
}

#[test]
fn the_box_may_open_a_chat_and_only_messenger_takes_it_never_served() {
    let window = capability(include_str!(
        "../capabilities/desktop-quick-ask-window.json"
    ));
    assert_eq!(window["windows"], json!(["ask"]));
    assert_eq!(
        window["permissions"],
        json!(["quick-ask:allow-hide", "quick-ask:allow-open-chat"])
    );
    let take = capability(include_str!(
        "../capabilities/desktop-quick-ask-take-chat.json"
    ));
    assert_eq!(take["windows"], json!(["messenger"]));
    assert_eq!(take["permissions"], json!(["quick-ask:allow-take-chat"]));
}
