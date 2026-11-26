//! Requirement `studio.src-tauri.quick-ask-window`.

use std::str::FromStr;
use std::sync::{Arc, Mutex};

use serde_json::{Value, json};
use tauri::test::{MockRuntime, mock_builder};
use tauri::webview::WebviewWindowBuilder;
use tauri::{App, Listener, Manager, Webview, WebviewUrl};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

use super::chat::{
    OPEN_CONVERSATION_EVENT, OpenConversation, open_chat, open_chat_from, take_chat,
};
use super::keys::{
    Area, KeyState, box_closes_after, default_shortcut, desktop_allows_keys, placement,
    saved_shortcut,
};
use super::{QuickAsk, hide, owns, shortcut, shortcut_set, show};

#[test]
fn the_default_keys_are_ctrl_alt_space_or_option_space() {
    let windows = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);
    let macos = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    assert_eq!(
        Shortcut::from_str(default_shortcut("windows")).ok(),
        Some(windows)
    );
    assert_eq!(
        Shortcut::from_str(default_shortcut("linux")).ok(),
        Some(windows)
    );
    assert_eq!(
        Shortcut::from_str(default_shortcut("macos")).ok(),
        Some(macos)
    );
    assert_eq!(saved_shortcut(None, "windows"), windows);
    assert_eq!(saved_shortcut(None, "macos"), macos);
}

#[test]
fn saved_keys_are_used_and_anything_else_falls_back_to_the_default() {
    let saved = json!("Control+Alt+K");
    assert_eq!(
        saved_shortcut(Some(&saved), "windows"),
        Shortcut::from_str("Control+Alt+K").expect("a shortcut")
    );
    let default = saved_shortcut(None, "windows");
    for value in [
        json!("not a shortcut"),
        json!(""),
        json!(42),
        Value::Null,
        json!("Space"),
        json!("Shift+Space"),
    ] {
        assert_eq!(saved_shortcut(Some(&value), "windows"), default, "{value}");
    }
}

#[test]
fn only_linux_with_wayland_lets_no_app_take_a_key() {
    assert!(!desktop_allows_keys("linux", Some("wayland"), true));
    assert!(!desktop_allows_keys("linux", Some("Wayland"), false));
    assert!(!desktop_allows_keys("linux", None, true));
    assert!(desktop_allows_keys("linux", Some("x11"), false));
    assert!(desktop_allows_keys("linux", None, false));
    assert!(desktop_allows_keys("windows", Some("wayland"), true));
    assert!(desktop_allows_keys("macos", None, false));
}

fn screen(left: i32, top: i32, width: u32, height: u32) -> Area {
    Area {
        left,
        top,
        width,
        height,
    }
}

#[test]
fn the_box_sits_centred_in_the_top_third_of_its_screen() {
    // A 704 × 560 window: the 640 px box with 32 px for its shadow on each
    // side, the box's top edge at 18% of the screen.
    assert_eq!(
        placement(screen(0, 0, 1920, 1080), 1.0),
        screen(608, 162, 704, 560)
    );
    assert_eq!(
        placement(screen(0, 0, 3840, 2160), 2.0),
        screen(1216, 325, 1408, 1120)
    );
}

#[test]
fn the_box_goes_on_the_screen_it_was_asked_on() {
    assert_eq!(
        placement(screen(1920, -200, 1920, 1080), 1.0),
        screen(2528, -38, 704, 560)
    );
    assert_eq!(
        placement(screen(-1280, 0, 1280, 1024), 1.0),
        screen(-992, 152, 704, 560)
    );
}

#[test]
fn on_a_small_screen_the_window_takes_its_width_and_ends_at_its_bottom() {
    assert_eq!(
        placement(screen(0, 0, 600, 800), 1.0),
        screen(0, 112, 600, 560)
    );
    assert_eq!(
        placement(screen(0, 0, 1366, 400), 1.0),
        screen(331, 40, 704, 360)
    );
    assert_eq!(
        placement(screen(0, 0, 1280, 720), 2.0),
        screen(0, 66, 1280, 654)
    );
}

#[test]
fn a_screen_without_a_usable_scale_counts_as_one() {
    let expected = placement(screen(0, 0, 1920, 1080), 1.0);
    for scale in [0.0, -1.0, f64::NAN, f64::INFINITY] {
        assert_eq!(placement(screen(0, 0, 1920, 1080), scale), expected);
    }
}

#[test]
fn a_hidden_box_closes_once_nothing_else_keeps_halonic_running() {
    assert!(box_closes_after("main", ["main", "ask"], false));
    assert!(box_closes_after("main", ["ask"], false));
    assert!(!box_closes_after("main", ["main", "ask"], true), "the tray");
    assert!(!box_closes_after(
        "main",
        ["main", "messenger", "ask"],
        false
    ));
    assert!(!box_closes_after("ask", ["ask"], false), "the box itself");
}

fn app_with(labels: &[&str]) -> App<MockRuntime> {
    let app = crate::shell(mock_builder())
        .build(tauri::generate_context!())
        .expect("the shell builds on the mock runtime");
    for label in labels {
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

#[test]
fn the_box_opens_once_under_its_own_label_and_only_it_can_hide_itself() {
    let app = app_with(&["main"]);
    show(app.handle()).expect("the box shows");
    show(app.handle()).expect("the box shows again");
    let mut labels: Vec<String> = app.webview_windows().into_keys().collect();
    labels.sort();
    assert_eq!(labels, ["ask", "main"]);
    assert_eq!(hide(webview(&app, "main")), Err("not_the_box"));
    assert_eq!(hide(webview(&app, "ask")), Ok(()));
}

#[test]
fn without_the_keys_plugin_nothing_is_registered_and_changes_are_refused() {
    // The tests' apps start without the global-shortcut plugin, as Linux
    // without a display does.
    let app = app_with(&[]);
    app.state::<QuickAsk>()
        .keys
        .lock()
        .expect("not poisoned")
        .take();
    super::register_saved(app.handle());
    let status = tauri::async_runtime::block_on(shortcut(app.handle().clone()));
    assert_ne!(status.state, KeyState::On);
    assert_eq!(
        status.shortcut,
        saved_shortcut(None, std::env::consts::OS).into_string()
    );
    assert!(!owns(
        app.handle(),
        &saved_shortcut(None, std::env::consts::OS)
    ));
    let set = |keys: &str| {
        tauri::async_runtime::block_on(shortcut_set(app.handle().clone(), keys.to_owned()))
    };
    assert_eq!(set("not a shortcut"), Err("invalid"));
    let refused = set("Control+Alt+K").expect_err("no keys can be registered");
    assert!(["unavailable", "wayland"].contains(&refused), "{refused}");
}

fn capability(text: &str) -> Value {
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert!(capability.get("remote").is_none(), "{capability}");
    capability
}

/// Every capability file in the folder, read as JSON, so a new one is
/// checked without anyone adding it here.
fn every_capability() -> Vec<(String, Value)> {
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities");
    let mut capabilities: Vec<(String, Value)> = std::fs::read_dir(folder)
        .expect("the capabilities folder")
        .map(|entry| {
            let path = entry.expect("a capability file").path();
            let text = std::fs::read_to_string(&path).expect("a readable capability");
            let name = path.display().to_string();
            let capability = serde_json::from_str(&text)
                .unwrap_or_else(|error| panic!("{name} isn't JSON: {error}"));
            (name, capability)
        })
        .collect();
    capabilities.sort_by(|a, b| a.0.cmp(&b.0));
    capabilities
}

/// Whether `capability` reaches the box's window: it names `ask` among its
/// windows or webviews, or a pattern, which could match `ask`.
fn reaches_the_box(capability: &Value) -> bool {
    ["windows", "webviews"].iter().any(|field| {
        capability[*field].as_array().is_some_and(|labels| {
            labels.iter().any(|label| {
                let label = label.as_str().unwrap_or("*");
                label == "ask" || label.contains(['*', '?', '['])
            })
        })
    })
}

/// A permission's identifier, whether it is named alone or with a scope.
fn permission_name(permission: &Value) -> String {
    permission
        .as_str()
        .or_else(|| permission["identifier"].as_str())
        .expect("a permission has an identifier")
        .to_owned()
}

#[test]
fn the_box_gets_exactly_the_commands_its_page_calls() {
    let mut granted = std::collections::BTreeSet::new();
    let mut reaching = Vec::new();
    for (name, capability) in every_capability() {
        if !reaches_the_box(&capability) {
            continue;
        }
        reaching.push(capability["identifier"].clone());
        let permissions = capability["permissions"].as_array().expect("permissions");
        granted.extend(permissions.iter().map(permission_name));
        assert_eq!(capability["local"], true, "{name}");
        assert!(capability.get("remote").is_none(), "{name}");
    }
    assert_eq!(reaching, [json!("desktop-quick-ask-box")]);
    // studio.ask-box-window: the commands the box's page calls, and no other.
    let expected: std::collections::BTreeSet<String> = [
        "allow-agent-host-request",
        "allow-host-settings-read",
        "allow-reopen-folder",
        "allow-show-main-window",
        "quick-ask:allow-hide",
        "quick-ask:allow-open-chat",
    ]
    .map(str::to_owned)
    .into();
    assert_eq!(granted, expected);
}

#[test]
fn no_capability_with_keys_trust_or_elevation_reaches_the_box() {
    let forbidden = [
        "desktop-secrets",
        "desktop-trust",
        "desktop-sandbox-elevate",
        "desktop-workspace-key",
    ];
    let capabilities = every_capability();
    for identifier in forbidden {
        let (name, capability) = capabilities
            .iter()
            .find(|(_, capability)| capability["identifier"] == identifier)
            .unwrap_or_else(|| panic!("no capability {identifier}"));
        assert!(!reaches_the_box(capability), "{name}");
    }
}

#[test]
fn only_studio_changes_the_keys() {
    let keys = capability(include_str!(
        "../capabilities/desktop-quick-ask-shortcut.json"
    ));
    assert_eq!(keys["windows"], json!(["main"]));
    assert_eq!(
        keys["permissions"],
        json!(["quick-ask:allow-shortcut", "quick-ask:allow-shortcut-set"])
    );
}

#[test]
fn no_capability_grants_the_global_shortcut_plugin() {
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities");
    for entry in std::fs::read_dir(folder).expect("the capabilities folder") {
        let path = entry.expect("a capability file").path();
        let text = std::fs::read_to_string(&path).expect("a readable capability");
        assert!(!text.contains("global-shortcut"), "{}", path.display());
    }
}

/// Every `open-conversation` event the app sends, as its payload's text.
fn heard_chats(app: &App<MockRuntime>) -> Arc<Mutex<Vec<String>>> {
    let heard = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&heard);
    app.listen_any(OPEN_CONVERSATION_EVENT, move |event| {
        sink.lock()
            .expect("not poisoned")
            .push(event.payload().to_owned());
    });
    heard
}

fn open_chat_in(
    app: &App<MockRuntime>,
    label: &str,
    conversation: &str,
) -> Result<(), &'static str> {
    tauri::async_runtime::block_on(open_chat(webview(app, label), conversation.to_owned()))
}

fn labels(app: &App<MockRuntime>) -> Vec<String> {
    let mut labels: Vec<String> = app.webview_windows().into_keys().collect();
    labels.sort();
    labels
}

/// `studio.src-tauri.quick-ask-open-chat`
#[test]
fn only_the_box_opens_a_chat_in_messenger() {
    let app = app_with(&["main", "inbox", "messenger", "ask"]);
    let heard = heard_chats(&app);
    for label in ["main", "inbox", "messenger"] {
        assert_eq!(
            open_chat_in(&app, label, "chat-acme-chief"),
            Err("not_the_box")
        );
    }
    assert!(heard.lock().expect("not poisoned").is_empty());
}

/// `studio.src-tauri.quick-ask-open-chat`
#[test]
fn the_box_hides_then_an_open_messenger_is_told_the_chat() {
    let app = app_with(&["ask", "messenger"]);
    let heard = heard_chats(&app);
    let hidden = std::cell::Cell::new(false);
    let opened = open_chat_from(app.handle(), "ask", "chat-acme-chief".to_owned(), || {
        assert!(
            heard.lock().expect("not poisoned").is_empty(),
            "hidden first"
        );
        hidden.set(true);
    });
    assert_eq!(opened, Ok(()));
    assert!(hidden.get());
    assert_eq!(
        *heard.lock().expect("not poisoned"),
        [r#"{"conversation":"chat-acme-chief"}"#]
    );
    assert_eq!(take_chat(webview(&app, "messenger")), Ok(None));
    assert_eq!(open_chat_in(&app, "ask", "chat-acme-liam"), Ok(()));
    assert_eq!(heard.lock().expect("not poisoned").len(), 2);
}

/// `studio.src-tauri.quick-ask-open-chat`
#[test]
fn a_closed_messenger_opens_and_its_page_takes_the_chat_once() {
    let app = app_with(&["main", "ask"]);
    let heard = heard_chats(&app);
    assert_eq!(open_chat_in(&app, "ask", "chat-acme-1"), Ok(()));
    assert_eq!(open_chat_in(&app, "ask", "chat-acme-2"), Ok(()));
    assert_eq!(labels(&app), ["ask", "main", "messenger"]);
    assert_eq!(
        *heard.lock().expect("not poisoned"),
        [r#"{"conversation":"chat-acme-2"}"#]
    );
    assert_eq!(take_chat(webview(&app, "main")), Err("not_messenger"));
    assert_eq!(take_chat(webview(&app, "ask")), Err("not_messenger"));
    let taken = OpenConversation {
        conversation: "chat-acme-1".to_owned(),
    };
    assert_eq!(take_chat(webview(&app, "messenger")), Ok(Some(taken)));
    assert_eq!(take_chat(webview(&app, "messenger")), Ok(None));
}

/// `studio.src-tauri.quick-ask-open-chat`
#[test]
fn an_empty_or_too_long_chat_id_is_refused_and_opens_nothing() {
    let app = app_with(&["ask"]);
    assert_eq!(open_chat_in(&app, "ask", ""), Err("invalid"));
    assert_eq!(open_chat_in(&app, "ask", &"c".repeat(513)), Err("invalid"));
    assert_eq!(labels(&app), ["ask"]);
    assert_eq!(open_chat_in(&app, "ask", &"c".repeat(512)), Ok(()));
    assert_eq!(labels(&app), ["ask", "messenger"]);
}

/// `studio.src-tauri.quick-ask-open-chat`
#[test]
fn only_the_box_may_open_a_chat_and_only_messenger_take_it() {
    let open = capability(include_str!(
        "../capabilities/desktop-quick-ask-open-chat.json"
    ));
    assert_eq!(open["windows"], json!(["ask"]));
    assert_eq!(open["permissions"], json!(["quick-ask:allow-open-chat"]));
    let take = capability(include_str!(
        "../capabilities/desktop-quick-ask-take-chat.json"
    ));
    assert_eq!(take["windows"], json!(["messenger"]));
    assert_eq!(take["permissions"], json!(["quick-ask:allow-take-chat"]));
}
