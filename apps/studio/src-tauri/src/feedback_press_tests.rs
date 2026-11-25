//! Requirement `studio.src-tauri.feedback-presses`.

use std::cell::RefCell;
use std::collections::HashSet;
use std::pin::pin;
use std::str::FromStr;
use std::sync::{Mutex, PoisonError};
use std::task::{Context, Poll, Waker};
use std::time::Instant;

use halonic_screen_still::{CropBox, Still};
use serde_json::json;
use tauri::async_runtime::{Mutex as AsyncMutex, block_on};
use tauri::test::mock_builder;
use tauri_plugin_global_shortcut::Shortcut;

use super::held::{
    Capturing, DEFAULT_SHORTCUT, Held, OpenWindows, Press, saved_shortcut, shortcut_of,
};
use super::shortcut::{Keys, change_shortcut, put_back, register_instead, shortcut_set};

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
    overlays: false,
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
    // The tests' shell hears no keys, so a good shortcut gets that far.
    assert_eq!(set("Alt+F"), Err("unavailable"));
}

#[test]
fn a_press_while_the_stills_are_being_taken_is_ignored() {
    let mut held = Held::default();
    assert_eq!(held.on_press(NONE_OPEN), Press::Capture);
    assert_eq!(held.on_press(NONE_OPEN), Press::Ignore);
    held.hold(vec![still()], Instant::now());
    held.clear();
    let opening = OpenWindows {
        overlays: true,
        send_feedback: false,
    };
    assert_eq!(
        held.on_press(opening),
        Press::Ignore,
        "holding and clearing leave the capture under way"
    );
    held.capture_done();
    assert_eq!(held.on_press(opening), Press::End);
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
        overlays: false,
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
        overlays: false,
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

/// The global-shortcut plugin, as a list of calls, refusing the keys in
/// `held_elsewhere` as another app's and never letting go of `stuck`.
#[derive(Default)]
struct FakeKeys {
    calls: RefCell<Vec<String>>,
    held_elsewhere: HashSet<Shortcut>,
    stuck: HashSet<Shortcut>,
}

impl Keys for FakeKeys {
    fn register(&self, shortcut: Shortcut) -> Result<(), String> {
        self.calls
            .borrow_mut()
            .push(format!("register {}", shortcut.into_string()));
        if self.held_elsewhere.contains(&shortcut) {
            return Err("another app holds it".to_owned());
        }
        Ok(())
    }

    fn unregister(&self, shortcut: Shortcut) -> Result<(), String> {
        self.calls
            .borrow_mut()
            .push(format!("unregister {}", shortcut.into_string()));
        if self.stuck.contains(&shortcut) {
            return Err("the system keeps it".to_owned());
        }
        Ok(())
    }
}

impl FakeKeys {
    fn take_calls(&self) -> Vec<String> {
        self.calls.take()
    }
}

#[test]
fn a_change_that_isnt_saved_puts_the_old_keys_back() {
    let (old, new) = (keys("Control+Alt+F"), keys("Control+Alt+K"));
    let plugin = FakeKeys::default();
    let mut registered = Some(old);
    let before = register_instead(&plugin, &mut registered, new);
    assert_eq!(before, Ok(Some(old)));
    assert_eq!(registered, Some(new));
    assert_eq!(
        plugin.take_calls(),
        ["register control+alt+KeyK", "unregister control+alt+KeyF"]
    );
    put_back(&plugin, &mut registered, new, Some(old));
    assert_eq!(registered, Some(old));
    assert_eq!(
        plugin.take_calls(),
        ["register control+alt+KeyF", "unregister control+alt+KeyK"]
    );
}

#[test]
fn putting_back_keeps_the_new_keys_when_the_old_ones_were_taken_meanwhile() {
    let (old, new) = (keys("Control+Alt+F"), keys("Control+Alt+K"));
    let plugin = FakeKeys {
        held_elsewhere: HashSet::from([old]),
        ..FakeKeys::default()
    };
    let mut registered = Some(new);
    put_back(&plugin, &mut registered, new, Some(old));
    assert_eq!(registered, Some(new), "some shortcut still works");
    assert_eq!(plugin.take_calls(), ["register control+alt+KeyF"]);
}

#[test]
fn the_same_keys_are_neither_registered_again_nor_let_go() {
    let same = keys("Control+Alt+F");
    let plugin = FakeKeys::default();
    let mut registered = Some(same);
    assert_eq!(
        register_instead(&plugin, &mut registered, same),
        Ok(Some(same))
    );
    put_back(&plugin, &mut registered, same, Some(same));
    assert_eq!(registered, Some(same));
    assert!(plugin.take_calls().is_empty());
}

#[test]
fn putting_back_keeps_the_new_keys_when_they_wont_let_go() {
    let (old, new) = (keys("Control+Alt+F"), keys("Control+Alt+K"));
    let plugin = FakeKeys {
        stuck: HashSet::from([new]),
        ..FakeKeys::default()
    };
    let mut registered = Some(new);
    put_back(&plugin, &mut registered, new, Some(old));
    assert_eq!(
        registered,
        Some(new),
        "the keys still heard are the new ones"
    );
    assert_eq!(
        plugin.take_calls(),
        [
            "register control+alt+KeyF",
            "unregister control+alt+KeyK",
            "unregister control+alt+KeyF"
        ],
        "the old keys are let go again, so only one shortcut is heard"
    );
}

#[test]
fn a_second_change_waits_until_the_first_is_saved_or_put_back() {
    let (old, first, second) = (
        keys("Control+Alt+F"),
        keys("Control+Alt+K"),
        keys("Control+Alt+J"),
    );
    let plugin = FakeKeys::default();
    let registered = Mutex::new(Some(old));
    let changing = AsyncMutex::new(());
    let mut later = pin!(change_shortcut(
        &plugin,
        &registered,
        &changing,
        second,
        |_| async { Ok(()) }
    ));
    let mut context = Context::from_waker(Waker::noop());
    let earlier = change_shortcut(&plugin, &registered, &changing, first, |_| {
        assert!(
            later.as_mut().poll(&mut context).is_pending(),
            "the second change waits while the first saves"
        );
        async { Err("the profile is read-only".to_owned()) }
    });
    assert_eq!(block_on(earlier), Err("failed"));
    assert_eq!(later.as_mut().poll(&mut context), Poll::Ready(Ok(())));
    assert_eq!(*registered.lock().expect("not poisoned"), Some(second));
    assert_eq!(
        plugin.take_calls(),
        [
            "register control+alt+KeyK",
            "unregister control+alt+KeyF",
            "register control+alt+KeyF",
            "unregister control+alt+KeyK",
            "register control+alt+KeyJ",
            "unregister control+alt+KeyF"
        ]
    );
}
