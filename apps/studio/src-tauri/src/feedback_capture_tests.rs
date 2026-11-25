//! Requirement `studio.src-tauri.feedback-capture`.

use std::str::FromStr;
use std::time::{Duration, Instant};

use halonic_screen_still::{CropBox, Still};
use serde_json::{Value, json};
use tauri::test::{MockRuntime, mock_builder};
use tauri::webview::WebviewWindowBuilder;
use tauri::{App, Manager, Webview, WebviewUrl};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

use super::held::{
    DEFAULT_SHORTCUT, Held, MAX_SCREENS, SelectedBox, overlay_index, saved_shortcut, still_bytes,
};
use super::{FeedbackCapture, crop, end, still as overlay_still};

/// A 4 × 2 still whose pixels count up from 0.
fn still() -> Still {
    Still {
        width: 4,
        height: 2,
        rgba: (0..32).collect(),
    }
}

fn whole_box(width: u32, height: u32) -> CropBox {
    CropBox {
        left: 0,
        top: 0,
        width,
        height,
    }
}

#[test]
fn the_default_shortcut_is_ctrl_alt_f_or_command_option_f() {
    let control = if cfg!(target_os = "macos") {
        Modifiers::SUPER
    } else {
        Modifiers::CONTROL
    };
    let expected = Shortcut::new(Some(control | Modifiers::ALT), Code::KeyF);
    assert_eq!(Shortcut::from_str(DEFAULT_SHORTCUT).ok(), Some(expected));
    assert_eq!(saved_shortcut(None), expected);
}

#[test]
fn a_saved_shortcut_is_used_and_anything_else_falls_back_to_the_default() {
    let saved = json!("CommandOrControl+Shift+K");
    assert_eq!(
        saved_shortcut(Some(&saved)),
        Shortcut::from_str("CommandOrControl+Shift+K").expect("a shortcut")
    );
    let default = saved_shortcut(None);
    for value in [json!("not a shortcut"), json!(""), json!(42), Value::Null] {
        assert_eq!(saved_shortcut(Some(&value)), default, "{value}");
    }
}

#[test]
fn only_overlay_labels_have_a_screen_number() {
    assert_eq!(overlay_index("feedback-overlay-0"), Some(0));
    assert_eq!(overlay_index("feedback-overlay-7"), Some(7));
    for label in [
        "main",
        "feedback",
        "feedback-overlay-",
        "feedback-overlay-x",
        "feedback-overlay-8",
    ] {
        assert_eq!(overlay_index(label), None, "{label}");
    }
}

#[test]
fn a_still_reaches_the_page_with_its_size_first() {
    let bytes = still_bytes(&still());
    assert_eq!(&bytes[..8], &[4, 0, 0, 0, 2, 0, 0, 0]);
    assert_eq!(&bytes[8..], still().rgba.as_slice());
}

#[test]
fn each_screen_gets_its_own_still_until_it_is_two_minutes_old() {
    let taken = Instant::now();
    let mut held = Held::default();
    held.hold(
        vec![
            still(),
            Still {
                width: 1,
                height: 1,
                rgba: vec![7; 4],
            },
        ],
        taken,
    );
    assert_eq!(held.still(1, taken).map(|still| still.width), Some(1));
    assert_eq!(held.still(2, taken), None);
    let later = taken + Duration::from_secs(120);
    assert_eq!(held.still(0, later), None);
    assert_eq!(
        held.still(0, taken),
        None,
        "an old still is dropped, not kept"
    );
}

#[test]
fn a_selection_keeps_only_the_crop() {
    let now = Instant::now();
    let mut held = Held::default();
    held.hold(vec![still()], now);
    let crop = CropBox {
        left: 1,
        top: 1,
        width: 2,
        height: 1,
    };
    assert!(held.select(0, crop, now));
    assert_eq!(held.crop(), still().crop(crop).as_ref());
    assert_eq!(held.still(0, now), None);
}

#[test]
fn a_box_outside_the_still_or_after_it_was_dropped_keeps_nothing() {
    let now = Instant::now();
    let mut held = Held::default();
    held.hold(vec![still()], now);
    assert!(!held.select(0, whole_box(5, 1), now));
    assert_eq!(held.crop(), None);
    assert_eq!(held.still(0, now), None);
    assert!(!held.select(0, whole_box(1, 1), now));
}

#[test]
fn a_new_press_drops_the_last_crop() {
    let now = Instant::now();
    let mut held = Held::default();
    held.hold(vec![still()], now);
    assert!(held.select(0, whole_box(4, 2), now));
    held.hold(vec![still()], now);
    assert_eq!(held.crop(), None);
}

#[test]
fn the_timer_drops_only_the_stills_of_its_own_press() {
    let now = Instant::now();
    let mut held = Held::default();
    let first = held.hold(vec![still()], now);
    let second = held.hold(vec![still()], now);
    assert!(!held.expire(first), "a later press is left alone");
    assert!(held.still(0, now).is_some());
    assert!(held.expire(second));
    assert_eq!(held.still(0, now), None);
    assert!(!held.expire(second), "nothing is left to drop");
}

#[test]
fn after_a_selection_the_timer_keeps_the_crop() {
    let now = Instant::now();
    let mut held = Held::default();
    let press = held.hold(vec![still()], now);
    assert!(held.select(0, whole_box(2, 2), now));
    assert!(!held.expire(press));
    assert!(held.crop().is_some());
}

#[test]
fn an_overlay_closed_another_way_drops_the_stills_and_the_end_drops_all() {
    let now = Instant::now();
    let mut held = Held::default();
    let first = held.hold(vec![still()], now);
    held.drop_stills_of(first);
    assert_eq!(held.still(0, now), None);
    let second = held.hold(vec![still()], now);
    assert!(held.select(0, whole_box(2, 2), now));
    held.drop_stills_of(second);
    assert!(
        held.crop().is_some(),
        "the crop stays for the Send feedback window"
    );
    held.clear();
    assert_eq!(held.crop(), None);
    assert!(
        held.hold(vec![still()], now) > first,
        "presses keep counting"
    );
}

#[test]
fn a_box_is_whole_numbers_from_zero_up_and_inside_its_screen() {
    let parse = |value: Value| serde_json::from_value::<SelectedBox>(value).ok();
    assert_eq!(
        parse(json!({"left": 1, "top": 2, "width": 3, "height": 4})),
        Some(SelectedBox {
            left: 1,
            top: 2,
            width: 3,
            height: 4
        })
    );
    for refused in [
        json!({"left": -1, "top": 0, "width": 3, "height": 4}),
        json!({"left": 0, "top": 0, "width": 2.5, "height": 4}),
        json!({"left": 0, "top": 0, "width": 3}),
        json!({"left": 0, "top": 0, "width": 4_294_967_296_u64, "height": 4}),
    ] {
        assert_eq!(parse(refused.clone()), None, "{refused}");
    }
    let now = Instant::now();
    let mut held = Held::default();
    held.hold(vec![still()], now);
    assert!(!held.select(0, whole_box(0, 2), now), "an empty box");
    held.hold(vec![still()], now);
    assert!(
        !held.select(1, whole_box(1, 1), now),
        "a screen that isn't there"
    );
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
fn only_an_overlay_window_gets_a_still_and_only_while_one_is_held() {
    let app = app_with(&["main", "feedback-overlay-0"]);
    let main = webview(&app, "main");
    let overlay = webview(&app, "feedback-overlay-0");
    assert_eq!(overlay_still(main).err(), Some("not_an_overlay"));
    assert_eq!(overlay_still(overlay.clone()).err(), Some("gone"));
    let state = app.state::<FeedbackCapture>();
    state
        .held
        .lock()
        .expect("not poisoned")
        .hold(vec![still()], Instant::now());
    assert!(overlay_still(overlay).is_ok());
}

#[test]
fn ending_drops_the_stills_and_the_crop() {
    let app = app_with(&["feedback-overlay-0"]);
    let state = app.state::<FeedbackCapture>();
    let now = Instant::now();
    {
        let mut held = state.held.lock().expect("not poisoned");
        held.hold(vec![still()], now);
        assert!(held.select(0, whole_box(2, 2), now));
    }
    assert!(crop(app.handle().clone()).is_ok());
    end(app.handle().clone());
    assert_eq!(crop(app.handle().clone()).err(), Some("gone"));
}

fn capability(text: &str) -> Value {
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert!(capability.get("remote").is_none(), "{capability}");
    capability
}

#[test]
fn each_feedback_window_is_granted_only_its_own_commands_and_never_served() {
    let overlay = capability(include_str!(
        "../capabilities/desktop-feedback-overlay.json"
    ));
    let labels: Vec<String> = (0..MAX_SCREENS)
        .map(|index| format!("feedback-overlay-{index}"))
        .collect();
    assert_eq!(overlay["windows"], json!(labels));
    assert_eq!(
        overlay["permissions"],
        json!([
            "feedback:allow-still",
            "feedback:allow-select",
            "feedback:allow-end"
        ])
    );
    let window = capability(include_str!("../capabilities/desktop-feedback-window.json"));
    assert_eq!(window["windows"], json!(["feedback"]));
    assert_eq!(
        window["permissions"],
        json!(["feedback:allow-crop", "feedback:allow-end"])
    );
    let shortcut = capability(include_str!(
        "../capabilities/desktop-feedback-shortcut.json"
    ));
    assert_eq!(shortcut["windows"], json!(["main"]));
    assert_eq!(
        shortcut["permissions"],
        json!(["feedback:allow-shortcut-set"])
    );
}
