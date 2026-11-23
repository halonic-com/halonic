//! The served page and the computer picker (HAL-16824): only the phone's
//! own page may call `phone_nearby_browse` and `phone_nearby_stop`, on
//! Android only, no page may call the Kotlin side, and the list reaches only
//! the app's own page, with names and ids and never an address.

use std::sync::{Arc, Mutex};

use halonic_connect::parse_address;
use serde_json::{Value, json};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::test::MockRuntime;
use tauri::{AppHandle, Manager, Url, Webview};

use super::{CONNECT_PAGE, SERVED_PAGE, app_window, invoke};
use crate::navigation::{ConfirmedAddress, on_navigation};
use crate::phone_nearby::{NearbyEvent, Seen, begin, end_page, endpoint, seen, stop, watching};

const COMMANDS: [&str; 2] = ["phone_nearby_browse", "phone_nearby_stop"];

/// The app's own page on this platform, which the window opens.
const APP_PAGE: &str = if cfg!(target_os = "android") {
    "http://tauri.localhost/connect.html"
} else if cfg!(windows) {
    "http://tauri.localhost/studio.html"
} else {
    "tauri://localhost/studio.html"
};

#[test]
fn served_page_is_refused_the_computer_picker() {
    let window = app_window();
    for command in COMMANDS {
        let refusal = invoke(&window, SERVED_PAGE, command, json!({}))
            .expect_err("the served page has no computer picker");
        assert!(
            refusal.to_string().contains("not allowed"),
            "{command} failed for another reason: {refusal}"
        );
    }
}

#[cfg(desktop)]
#[test]
fn phone_nearby_commands_are_allowed_to_no_page_on_desktop() {
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
fn phone_nearby_commands_are_granted_to_the_phone_s_own_page_only() {
    let text = include_str!("../../capabilities/phone-nearby.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert_eq!(capability["platforms"], json!(["android"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!(["allow-phone-nearby-browse", "allow-phone-nearby-stop"])
    );
}

#[test]
fn phone_nearby_commands_leave_android_s_search_to_the_shell() {
    // Only the shell starts and stops the Kotlin search, from Rust. The
    // plugin is registered on Android only, but the ACL refuses it anywhere.
    let window = app_window();
    for from in [CONNECT_PAGE, SERVED_PAGE] {
        for command in [
            "plugin:phone-nearby|browse",
            "plugin:phone-nearby|stop",
            "plugin:phone-nearby|register_listener",
        ] {
            assert!(
                invoke(&window, from, command, json!({})).is_err(),
                "{command} must be refused from {from}"
            );
        }
    }
}

/// A channel that keeps what it is sent.
fn recording() -> (Channel<NearbyEvent>, Arc<Mutex<Vec<Value>>>) {
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

/// The id of the first computer in the newest list the page was sent.
fn listed_id(sent: &Mutex<Vec<Value>>) -> String {
    let sent = sent.lock().unwrap();
    let id = &sent.last().expect("a list")["computers"][0]["id"];
    id.as_str().expect("a listed computer").to_owned()
}

/// What the Kotlin side sends, as it sends it.
fn kotlin(change: Value) -> Seen {
    serde_json::from_value(change).expect("a change the Kotlin side sends")
}

fn found(browse: u64, key: &str, name: &str) -> Seen {
    kotlin(json!({
        "browse": browse,
        "kind": "found",
        "key": key,
        "name": name,
        "address": "192.168.1.20",
        "port": 4100,
    }))
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
fn phone_nearby_commands_send_the_page_names_and_ids_only() {
    let (app, webview) = on_app_page();
    let (channel, sent) = recording();
    let browse = begin(&webview, channel).expect("the app's own page browses");
    seen(&app, found(browse, "halonic-aa", "Desk"));
    let desk = listed_id(&sent);
    seen(&app, found(browse, "halonic-aa", "Desk"));
    seen(
        &app,
        kotlin(json!({ "browse": browse, "kind": "lost", "key": "halonic-aa" })),
    );
    assert_eq!(
        *sent.lock().unwrap(),
        vec![
            json!({ "kind": "computers", "computers": [] }),
            json!({ "kind": "computers", "computers": [{ "id": desk, "name": "Desk" }] }),
            json!({ "kind": "computers", "computers": [] }),
        ]
    );
}

#[test]
fn phone_nearby_commands_empty_the_list_in_the_background() {
    let (app, webview) = on_app_page();
    let (channel, sent) = recording();
    let browse = begin(&webview, channel).expect("the app's own page browses");
    seen(&app, found(browse, "halonic-aa", "Desk"));
    let desk = listed_id(&sent);
    seen(&app, kotlin(json!({ "browse": browse, "kind": "cleared" })));
    assert_eq!(
        sent.lock().unwrap().last(),
        Some(&json!({ "kind": "computers", "computers": [] }))
    );
    assert_eq!(endpoint(&app, &desk), None);
}

#[test]
fn phone_nearby_commands_pair_by_id_after_the_picker_closes() {
    let (app, webview) = on_app_page();
    let (channel, sent) = recording();
    let browse = begin(&webview, channel).expect("the app's own page browses");
    seen(&app, found(browse, "halonic-aa", "Desk"));
    let desk = listed_id(&sent);

    // The picker closes (`phone_nearby_stop`): the list stays for pairing,
    // and a late hit of that browse changes nothing and reaches no page.
    stop(&app);
    assert!(!watching(&app));
    assert_eq!(
        endpoint(&app, &desk).as_deref(),
        Some("tcp://192.168.1.20:4100")
    );
    seen(&app, found(browse, "halonic-bb", "Late"));
    assert_eq!(sent.lock().unwrap().len(), 2);
}

#[test]
fn phone_nearby_commands_ignore_hits_from_an_earlier_browse() {
    let (app, webview) = on_app_page();
    let (first, _) = recording();
    let earlier = begin(&webview, first).expect("the app's own page browses");
    let (second, sent) = recording();
    let browse = begin(&webview, second).expect("a new browse replaces it");
    assert_ne!(earlier, browse);
    seen(&app, found(earlier, "halonic-aa", "Desk"));
    assert_eq!(sent.lock().unwrap().len(), 1, "only the empty list");
}

#[test]
fn phone_nearby_commands_send_nothing_once_the_window_is_on_the_served_page() {
    let (app, webview) = on_app_page();
    let (channel, sent) = recording();
    let browse = begin(&webview, channel).expect("the app's own page browses");

    // The window moves on without asking the guard, as Android's WebView
    // does for a form sent with POST: the next change finds it on the
    // served page, isn't sent, and ends the browse.
    go(&webview, SERVED_PAGE);
    seen(&app, found(browse, "halonic-aa", "Desk"));
    assert_eq!(sent.lock().unwrap().len(), 1, "only the empty list");
    assert!(!watching(&app));

    go(&webview, APP_PAGE);
    seen(&app, found(browse, "halonic-bb", "Desk"));
    assert_eq!(sent.lock().unwrap().len(), 1);
}

#[test]
fn phone_nearby_commands_end_the_picker_when_the_window_leaves() {
    let (app, webview) = on_app_page();
    let confirmed = parse_address("192.168.1.20:4280").expect("the served address");
    app.state::<ConfirmedAddress>().set(Some(confirmed));
    let (channel, sent) = recording();
    let browse = begin(&webview, channel).expect("the app's own page browses");
    seen(&app, found(browse, "halonic-aa", "Desk"));
    let desk = listed_id(&sent);
    assert!(endpoint(&app, &desk).is_some());

    // The guard lets the window go to the confirmed address: the browse
    // and its list end before the served page loads.
    let served: Url = SERVED_PAGE.parse().expect("a test URL");
    assert!(on_navigation(&webview, &served));
    assert!(!watching(&app));
    assert_eq!(endpoint(&app, &desk), None);
    seen(&app, found(browse, "halonic-bb", "Late"));
    assert_eq!(sent.lock().unwrap().len(), 2);
}

#[test]
fn phone_nearby_commands_end_the_picker_of_a_page_that_reloads() {
    let (app, webview) = on_app_page();
    let (channel, sent) = recording();
    let browse = begin(&webview, channel).expect("the app's own page browses");
    seen(&app, found(browse, "halonic-aa", "Desk"));
    let desk = listed_id(&sent);
    // A page that starts loading or closes (lib.rs calls this).
    end_page(&app);
    assert!(!watching(&app));
    assert_eq!(endpoint(&app, &desk), None);
}

#[test]
fn phone_nearby_commands_refuse_a_browse_from_the_served_page() {
    let (app, webview) = on_app_page();
    go(&webview, SERVED_PAGE);
    let (channel, sent) = recording();
    assert_eq!(begin(&webview, channel), None);
    assert!(sent.lock().unwrap().is_empty());
    assert!(!watching(&app));
}
