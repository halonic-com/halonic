//! Quick ask's plain parts (HAL-18787): its default keys, the saved keys,
//! whether the desktop lets an app take a key for the whole screen, and
//! where the box's window goes on a screen. Plain values and functions, so
//! they test without a screen or a keyboard.

use std::str::FromStr;

use serde::Serialize;
use serde_json::Value;
use tauri_plugin_global_shortcut::{Modifiers, Shortcut};

use crate::focused_apps::FocusedApp;

/// The host setting that holds quick ask's keys, as `shortcut_set` writes it.
pub const SHORTCUT_SETTING: &str = "quick-ask.shortcut";

/// The box's width, without its shadow, in logical pixels (the v2 mockup
/// on HAL-18594).
pub const BOX_WIDTH: f64 = 640.0;

/// The room around the box for its shadow and its 16 px corners: the
/// window is this much larger on each side (design HAL-18594, "For the
/// build").
pub const SHADOW_MARGIN: f64 = 32.0;

/// The window's height: the box at its tallest, with an answer of about
/// 380 px, and its shadow. The page draws nothing below the box.
pub const WINDOW_HEIGHT: f64 = 560.0;

/// How far down the screen the box's top edge sits, as in the mockup: in
/// the top third, where the eye already is.
pub const BOX_TOP: f64 = 0.18;

/// Ctrl+Alt+Space, or ⌥Space on macOS, where ⌃⌥Space switches the keyboard
/// language (design HAL-18594, section 5). `os` is `std::env::consts::OS`.
pub fn default_shortcut(os: &str) -> &'static str {
    if os == "macos" {
        "Alt+Space"
    } else {
        "Control+Alt+Space"
    }
}

/// The keys `text` names, when they hold Ctrl, Alt or Super (⌘), as the
/// feedback shortcut's do. Shift alone isn't enough: a global Shift+Space
/// would take every space typed in any app.
pub fn shortcut_of(text: &str) -> Option<Shortcut> {
    let shortcut = Shortcut::from_str(text).ok()?;
    let holding = Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER;
    shortcut.mods.intersects(holding).then_some(shortcut)
}

/// The keys the saved `value` names, or the default for `os` when nothing
/// is saved or the value isn't keys `shortcut_of` takes.
pub fn saved_shortcut(value: Option<&Value>, os: &str) -> Shortcut {
    value
        .and_then(Value::as_str)
        .and_then(shortcut_of)
        .unwrap_or_else(|| shortcut_of(default_shortcut(os)).expect("the default keys hold Alt"))
}

/// Whether the desktop lets an app take a key for the whole screen. Linux
/// with Wayland doesn't: it gives a key only to the window that has the
/// focus, so a registered key would seem to work and never fire. `os` is
/// `std::env::consts::OS`; `session_type` is `XDG_SESSION_TYPE`, and
/// `wayland_display` says whether `WAYLAND_DISPLAY` is set.
pub fn desktop_allows_keys(os: &str, session_type: Option<&str>, wayland_display: bool) -> bool {
    let wayland = session_type.is_some_and(|session| session.eq_ignore_ascii_case("wayland"));
    os != "linux" || !(wayland || wayland_display)
}

/// Whether quick ask's keys work, for Settings › Shortcuts.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum KeyState {
    /// Registered: a press opens the box.
    On,
    /// The system or another app holds the keys.
    Taken,
    /// Linux with Wayland, which lets no app take a key for the whole screen.
    Wayland,
    /// Studio hears no keys here, such as Linux without a display.
    Unavailable,
}

/// Quick ask's keys and whether they work, as Settings reads them.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct KeyStatus {
    /// The keys, as the global-shortcut plugin writes them.
    pub shortcut: String,
    pub state: KeyState,
}

/// A screen's area, or a window's, in physical pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Area {
    pub left: i32,
    pub top: i32,
    pub width: u32,
    pub height: u32,
}

/// Where the box's window goes on `screen`, whose scale is `scale`:
/// centred, with the box's top edge at `BOX_TOP` of the screen's height. On
/// a screen narrower than the window, the window takes the screen's width,
/// and the page's box its width less 16 px on each side; on a short screen,
/// the window ends at the screen's bottom.
pub fn placement(screen: Area, scale: f64) -> Area {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let screen_width = f64::from(screen.width);
    let screen_height = f64::from(screen.height);
    let width = ((BOX_WIDTH + 2.0 * SHADOW_MARGIN) * scale)
        .min(screen_width)
        .round();
    let top = (screen_height * BOX_TOP - SHADOW_MARGIN * scale)
        .max(0.0)
        .round();
    let height = (WINDOW_HEIGHT * scale).min(screen_height - top).round();
    Area {
        left: screen.left + ((screen_width - width) / 2.0).floor() as i32,
        top: screen.top + top as i32,
        width: width as u32,
        height: height as u32,
    }
}

/// Whether the box's window closes once the window `closed` closed, with
/// `open` the labels of the windows still listed: only when no other
/// window is left and Halonic doesn't keep running in the tray
/// (`in_tray`), so a hidden box never keeps Halonic running with nothing
/// showing.
pub fn box_closes_after<'a>(
    closed: &str,
    open: impl IntoIterator<Item = &'a str>,
    in_tray: bool,
) -> bool {
    let ask = FocusedApp::Ask.name();
    closed != ask
        && !in_tray
        && open
            .into_iter()
            .all(|label| label == closed || label == ask)
}
