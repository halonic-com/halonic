//! Requirement `studio.src-tauri.feedback-capture`.

use std::time::{Duration, Instant};

use halonic_screen_still::{CropBox, Still};
use serde_json::{Value, json};
use tauri::test::{MockRuntime, mock_builder};
use tauri::webview::WebviewWindowBuilder;
use tauri::{App, Manager, Webview, WebviewUrl};

use super::held::{CallerState, Held, SelectedBox, UNAVAILABLE_WINDOW, still_bytes};
use super::{FEEDBACK_WINDOW, FeedbackCapture, crop, end, select, start};

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
fn a_still_reaches_the_page_with_its_size_first() {
    let bytes = still_bytes(&still());
    assert_eq!(&bytes[..8], &[4, 0, 0, 0, 2, 0, 0, 0]);
    assert_eq!(&bytes[8..], still().rgba.as_slice());
}

#[test]
fn the_still_is_held_until_it_is_two_minutes_old() {
    let taken = Instant::now();
    let mut held = Held::default();
    held.hold(still(), "main", taken);
    assert_eq!(held.still(taken).map(|still| still.width), Some(4));
    let later = taken + Duration::from_secs(120);
    assert_eq!(held.still(later), None);
    assert_eq!(held.still(taken), None, "an old still is dropped, not kept");
}

#[test]
fn a_selection_keeps_only_the_crop() {
    let now = Instant::now();
    let mut held = Held::default();
    held.hold(still(), "main", now);
    let crop = CropBox {
        left: 1,
        top: 1,
        width: 2,
        height: 1,
    };
    assert_eq!(held.select("main", crop, now), Ok(()));
    assert_eq!(held.crop(), still().crop(crop).as_ref());
    assert_eq!(held.still(now), None);
}

#[test]
fn only_the_window_whose_press_took_the_still_selects_from_it() {
    let now = Instant::now();
    let mut held = Held::default();
    held.hold(still(), "main", now);
    assert_eq!(
        held.select("inbox", whole_box(2, 2), now),
        Err("other_window")
    );
    assert!(held.still(now).is_some(), "the still stays for its window");
    assert_eq!(held.select("main", whole_box(2, 2), now), Ok(()));
    assert_eq!(
        held.select("inbox", whole_box(2, 2), now),
        Err("other_window")
    );
    assert!(held.crop().is_some(), "the crop stays for its window");
}

#[test]
fn a_box_outside_the_still_or_after_it_was_dropped_keeps_nothing() {
    let now = Instant::now();
    let mut held = Held::default();
    held.hold(still(), "main", now);
    assert_eq!(held.select("main", whole_box(5, 1), now), Err("gone"));
    assert_eq!(held.crop(), None);
    assert_eq!(held.still(now), None);
    assert_eq!(held.select("main", whole_box(1, 1), now), Err("gone"));
}

#[test]
fn a_new_press_drops_the_last_crop() {
    let now = Instant::now();
    let mut held = Held::default();
    held.hold(still(), "main", now);
    assert_eq!(held.select("main", whole_box(4, 2), now), Ok(()));
    held.hold(still(), "main", now);
    assert_eq!(held.crop(), None);
}

#[test]
fn the_timer_drops_only_the_still_of_its_own_press() {
    let now = Instant::now();
    let mut held = Held::default();
    let first = held.hold(still(), "main", now);
    let second = held.hold(still(), "inbox", now);
    assert!(!held.expire(first), "a later press is left alone");
    assert!(held.still(now).is_some());
    assert!(held.expire(second));
    assert_eq!(held.still(now), None);
    assert!(!held.expire(second), "nothing is left to drop");
}

#[test]
fn after_a_selection_the_timer_keeps_the_crop() {
    let now = Instant::now();
    let mut held = Held::default();
    let press = held.hold(still(), "main", now);
    assert_eq!(held.select("main", whole_box(2, 2), now), Ok(()));
    assert!(!held.expire(press));
    assert!(held.crop().is_some());
}

#[test]
fn the_end_drops_all_and_presses_keep_counting() {
    let now = Instant::now();
    let mut held = Held::default();
    let first = held.hold(still(), "main", now);
    assert_eq!(held.select("main", whole_box(2, 2), now), Ok(()));
    held.clear();
    assert_eq!(held.crop(), None);
    assert_eq!(
        held.select("inbox", whole_box(2, 2), now),
        Err("gone"),
        "after the end, no window's press holds anything"
    );
    assert!(
        held.hold(still(), "main", now) > first,
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
    held.hold(still(), "main", now);
    assert_eq!(
        held.select("main", whole_box(0, 2), now),
        Err("gone"),
        "an empty box"
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
fn only_a_studio_window_selects_and_only_while_a_still_is_held() {
    let app = app_with(&["main", "other"]);
    let area = SelectedBox {
        left: 0,
        top: 0,
        width: 2,
        height: 2,
    };
    let other = webview(&app, "other");
    assert_eq!(
        tauri::async_runtime::block_on(select(other, area)).err(),
        Some("not_a_studio_window")
    );
    let main = webview(&app, "main");
    assert_eq!(
        tauri::async_runtime::block_on(select(main, area)).err(),
        Some("gone")
    );
}

#[test]
fn a_window_captures_only_while_focused_visible_and_not_minimised() {
    let in_front = CallerState {
        focused: true,
        visible: true,
        minimized: false,
    };
    assert!(in_front.may_capture());
    for refused in [
        CallerState {
            focused: false,
            ..in_front
        },
        CallerState {
            visible: false,
            ..in_front
        },
        CallerState {
            minimized: true,
            ..in_front
        },
        CallerState::default(),
    ] {
        assert!(!refused.may_capture(), "{refused:?}");
    }
}

#[test]
fn only_a_focused_studio_window_starts_a_capture() {
    let others = ["other", "ask", FEEDBACK_WINDOW, UNAVAILABLE_WINDOW];
    let app = app_with(&[&["main"][..], &others[..]].concat());
    for label in others {
        let window = app.get_webview_window(label).expect("the window is open");
        assert_eq!(
            tauri::async_runtime::block_on(start(window)).err(),
            Some("not_a_studio_window"),
            "{label}"
        );
    }
    // The mock runtime's windows are never focused, as a window behind
    // another app isn't.
    let main = app.get_webview_window("main").expect("the window is open");
    assert_eq!(
        tauri::async_runtime::block_on(start(main)).err(),
        Some("not_focused")
    );
    let state = app.state::<FeedbackCapture>();
    let mut held = state.held.lock().expect("not poisoned");
    assert_eq!(held.still(Instant::now()), None, "no still was taken");
}

#[test]
fn ending_drops_the_stills_and_the_crop() {
    let app = app_with(&["main"]);
    let state = app.state::<FeedbackCapture>();
    let now = Instant::now();
    {
        let mut held = state.held.lock().expect("not poisoned");
        held.hold(still(), "main", now);
        assert_eq!(held.select("main", whole_box(2, 2), now), Ok(()));
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
    let capture = capability(include_str!(
        "../capabilities/desktop-feedback-capture.json"
    ));
    assert_eq!(capture["windows"], json!(["main", "inbox", "messenger"]));
    assert_eq!(
        capture["permissions"],
        json!([
            "feedback:allow-start",
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
    let unavailable = capability(include_str!(
        "../capabilities/desktop-feedback-unavailable.json"
    ));
    assert_eq!(unavailable["windows"], json!(["feedback-unavailable"]));
    assert_eq!(unavailable["permissions"], json!(["feedback:allow-end"]));
}
