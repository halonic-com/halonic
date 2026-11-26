//! Requirement `studio.src-tauri.feedback-presses`.

use std::str::FromStr;
use std::sync::{Mutex, PoisonError};
use std::time::Instant;

use halonic_screen_still::{CropBox, Still};
use serde_json::json;
use tauri::test::mock_builder;
use tauri_plugin_global_shortcut::Shortcut;

use super::held::{
    Capturing, DEFAULT_SHORTCUT, Held, OpenWindows, Press, saved_shortcut, shortcut_of,
};
use super::shortcut::shortcut_set;

fn still() -> Still {
    Still {
        width: 1,
        height: 1,
        rgba: vec![9; 4],
    }
}

fn keys(text: &str) -> Shortcut {
    Shortcut::from_str(text).expect("a shortcut")
}

const NONE_OPEN: OpenWindows = OpenWindows {
    send_feedback: false,
};

#[test]
fn a_shortcut_needs_ctrl_alt_or_super() {
    for text in ["Alt+F", "Super+F", "Control+Shift+K", DEFAULT_SHORTCUT] {
        assert_eq!(shortcut_of(text), Some(keys(text)), "{text}");
    }
    for text in ["F", "Shift+F", "F5", "Shift+Space", "not a shortcut"] {
        assert_eq!(shortcut_of(text), None, "{text}");
    }
    let default = saved_shortcut(None);
    assert_eq!(saved_shortcut(Some(&json!("Shift+F"))), default);
    assert_eq!(saved_shortcut(Some(&json!("F"))), default);
}

#[test]
fn setting_a_shortcut_without_ctrl_alt_or_super_is_refused_as_invalid() {
    let app = crate::shell(mock_builder())
        .build(tauri::generate_context!())
        .expect("the shell builds on the mock runtime");
    let set = |text: &str| {
        tauri::async_runtime::block_on(shortcut_set(app.handle().clone(), text.to_owned()))
    };
    assert_eq!(set("Shift+F"), Err("invalid"));
    assert_eq!(set("F"), Err("invalid"));
}

#[test]
fn a_press_while_the_stills_are_being_taken_is_ignored() {
    let mut held = Held::default();
    assert_eq!(held.on_press(NONE_OPEN), Press::Capture);
    assert_eq!(held.on_press(NONE_OPEN), Press::Ignore);
    held.hold(vec![still()], Instant::now());
    held.clear();
    assert_eq!(
        held.on_press(NONE_OPEN),
        Press::Ignore,
        "holding and clearing leave the capture under way"
    );
    held.capture_done();
    assert_eq!(held.on_press(NONE_OPEN), Press::Capture);
}

#[test]
fn a_press_while_the_send_feedback_window_is_open_brings_it_forward() {
    let now = Instant::now();
    let mut held = Held::default();
    let press = held.hold(vec![still()], now);
    let whole = CropBox {
        left: 0,
        top: 0,
        width: 1,
        height: 1,
    };
    assert!(held.select(0, whole, now));
    let open = OpenWindows {
        send_feedback: true,
    };
    assert_eq!(held.on_press(open), Press::ShowSendFeedback);
    assert!(held.crop().is_some(), "what the window shows stays");
    assert_eq!(
        held.on_press(NONE_OPEN),
        Press::Capture,
        "bringing it forward takes no capture"
    );
    assert_eq!(held.press(), press);
}

#[test]
fn a_window_that_closes_late_leaves_the_next_press_alone() {
    let now = Instant::now();
    let mut held = Held::default();
    let first = held.hold(vec![still()], now);
    let second = held.hold(vec![still()], now);
    held.clear_press(first);
    held.drop_stills_of(first);
    assert!(
        held.still(0, now).is_some(),
        "the second press's still stays"
    );
    held.drop_stills_of(second);
    assert_eq!(held.still(0, now), None);
    let third = held.hold(vec![still()], now);
    held.clear_press(third);
    assert_eq!(held.still(0, now), None);
}

#[test]
fn a_capture_that_panics_still_lets_the_next_press_capture() {
    let held = Mutex::new(Held::default());
    let press = held.lock().expect("not poisoned").on_press(NONE_OPEN);
    assert_eq!(press, Press::Capture);
    let capture = std::panic::catch_unwind(|| {
        let _capturing = Capturing(&held);
        panic!("the screen went away while its still was taken");
    });
    assert!(capture.is_err());
    let mut held = held.lock().unwrap_or_else(PoisonError::into_inner);
    assert_eq!(held.on_press(NONE_OPEN), Press::Capture);
}

#[test]
fn a_press_while_the_send_feedback_window_closes_takes_a_new_capture() {
    let open = OpenWindows {
        send_feedback: true,
    };
    let mut held = Held::default();
    held.send_feedback_closing();
    held.clear();
    assert_eq!(held.on_press(open), Press::Capture);
    held.capture_done();
    held.send_feedback_closed();
    assert_eq!(held.on_press(open), Press::ShowSendFeedback);
}
