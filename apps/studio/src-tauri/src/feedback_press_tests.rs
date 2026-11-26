//! Requirement `studio.src-tauri.feedback-presses`.

use std::str::FromStr;
use std::sync::{Mutex, PoisonError};
use std::time::Instant;

use halonic_screen_still::Still;
use tauri::test::mock_builder;
use tauri_plugin_global_shortcut::Shortcut;

use super::held::{Capturing, Held, Press, shortcut_of};
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

#[test]
fn a_shortcut_needs_ctrl_alt_or_super() {
    for text in [
        "Alt+F",
        "Super+F",
        "Control+Shift+K",
        "CommandOrControl+Shift+F",
    ] {
        assert_eq!(shortcut_of(text), Some(keys(text)), "{text}");
    }
    for text in ["F", "Shift+F", "F5", "Shift+Space", "not a shortcut"] {
        assert_eq!(shortcut_of(text), None, "{text}");
    }
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
fn a_press_while_the_still_is_being_taken_is_ignored() {
    let mut held = Held::default();
    assert_eq!(held.on_press(), Press::Capture);
    assert_eq!(held.on_press(), Press::Ignore);
    held.hold(still(), "main", Instant::now());
    held.clear();
    assert_eq!(
        held.on_press(),
        Press::Ignore,
        "holding and clearing leave the capture under way"
    );
    held.capture_done();
    assert_eq!(held.on_press(), Press::Capture);
}

#[test]
fn a_capture_that_panics_still_lets_the_next_press_capture() {
    let held = Mutex::new(Held::default());
    let press = held.lock().expect("not poisoned").on_press();
    assert_eq!(press, Press::Capture);
    let capture = std::panic::catch_unwind(|| {
        let _capturing = Capturing(&held);
        panic!("the screen went away while its still was taken");
    });
    assert!(capture.is_err());
    let mut held = held.lock().unwrap_or_else(PoisonError::into_inner);
    assert_eq!(held.on_press(), Press::Capture);
}
