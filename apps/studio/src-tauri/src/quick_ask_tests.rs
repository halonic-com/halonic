//! Requirement `studio.src-tauri.quick-ask-window`.

use std::str::FromStr;

use serde_json::{Value, json};
use tauri::test::{MockRuntime, mock_builder};
use tauri::webview::WebviewWindowBuilder;
use tauri::{App, Manager, Webview, WebviewUrl};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

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

#[test]
fn the_box_may_only_hide_itself_and_only_studio_changes_the_keys() {
    let window = capability(include_str!(
        "../capabilities/desktop-quick-ask-window.json"
    ));
    assert_eq!(window["windows"], json!(["ask"]));
    assert_eq!(window["permissions"], json!(["quick-ask:allow-hide"]));
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
