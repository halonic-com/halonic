//! Each window comes back where it was (HAL-19204, board request). Studio,
//! the Inbox and the Messenger are all Halonic.exe, and window managers
//! such as FancyZones keep one place per exe, so the shell keeps each
//! window's own: its position, size and maximised state, by its label
//! (tauri-plugin-window-state, `.window-state.json` in the app's config
//! folder). Only those three windows are kept; the feedback and brief
//! windows open where they always do.
//!
//! The plugin restores nothing by itself: `window.rs` calls `restore` on a
//! window that is still hidden, after its taskbar ID is set, so it shows in
//! its place at once. A place on no connected screen moves to the middle of
//! the primary screen. The plugin saves each window's place when it closes
//! (Studio's hides to the tray) and when Halonic quits. Registered from Rust
//! only: no capability grants its commands, so no page can call them.

use tauri::plugin::TauriPlugin;
use tauri::{PhysicalPosition, PhysicalSize, Runtime, WebviewWindow};
use tauri_plugin_window_state::{Builder, StateFlags, WindowExt};

use crate::focused_apps::window_labels;

/// The smallest part of a window, in pixels across and down, that must be
/// on a screen for it to stay where it was: enough to grab and move it.
const MIN_VISIBLE: u32 = 64;

/// What the shell keeps of each window: never whether it shows, since
/// Studio's window hides to the tray and must not come back hidden.
pub fn kept() -> StateFlags {
    StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED
}

/// Whether the window labelled `label` has its place kept.
pub fn is_kept(label: &str) -> bool {
    window_labels().contains(&label)
}

/// The window state plugin, keeping `kept()` of the windows `is_kept`
/// names, and restoring none by itself.
pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    window_labels()
        .into_iter()
        .fold(Builder::new(), Builder::skip_initial_state)
        .with_state_flags(kept())
        .with_filter(is_kept)
        .build()
}

/// Puts the hidden `window` back in its kept place, or on the primary
/// screen when that place is on no connected screen. A place that can't be
/// read or set leaves the window where the system put it.
pub fn restore<R: Runtime>(window: &WebviewWindow<R>) {
    if !is_kept(window.label()) {
        return;
    }
    if let Err(error) = window.restore_state(kept()) {
        halonic_shell_log::record("window", format_args!("its place wasn't restored: {error}"));
    }
    if let Err(error) = keep_on_screen(window) {
        halonic_shell_log::record("window", format_args!("it wasn't moved on screen: {error}"));
    }
}

fn keep_on_screen<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    if window.is_maximized()? {
        return Ok(());
    }
    let screens: Vec<Rect> = window
        .available_monitors()?
        .iter()
        .map(|monitor| Rect::new(*monitor.position(), *monitor.size()))
        .collect();
    let primary = window
        .primary_monitor()?
        .map(|monitor| Rect::new(monitor.work_area().position, monitor.work_area().size));
    let outer = window.outer_size()?;
    let current = Rect::new(window.outer_position()?, outer);
    let Some(place) = fallback(current, &screens, primary) else {
        return Ok(());
    };
    // The plugin sets the inner size; the frame around it stays the same.
    let inner = window.inner_size()?;
    window.set_size(PhysicalSize::new(
        place.width - (outer.width - inner.width).min(place.width),
        place.height - (outer.height - inner.height).min(place.height),
    ))?;
    window.set_position(PhysicalPosition::new(place.x, place.y))
}

/// A window's or a screen's outer rectangle, in physical pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Rect {
    fn new(position: PhysicalPosition<i32>, size: PhysicalSize<u32>) -> Rect {
        Rect {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        }
    }

    /// How far it overlaps `other`, across and down.
    fn overlap(self, other: Rect) -> (i64, i64) {
        let across = (i64::from(self.x) + i64::from(self.width))
            .min(i64::from(other.x) + i64::from(other.width))
            - i64::from(self.x.max(other.x));
        let down = (i64::from(self.y) + i64::from(self.height))
            .min(i64::from(other.y) + i64::from(other.height))
            - i64::from(self.y.max(other.y));
        (across, down)
    }
}

/// Where `window` goes: `None` to keep it, when at least `MIN_VISIBLE`
/// pixels of it across and down are on one of `screens`, or when there is
/// no `primary` screen to move it to. Otherwise the middle of `primary`'s
/// work area, no bigger than that area.
pub fn fallback(window: Rect, screens: &[Rect], primary: Option<Rect>) -> Option<Rect> {
    let visible = screens.iter().any(|screen| {
        let (across, down) = window.overlap(*screen);
        across >= i64::from(MIN_VISIBLE) && down >= i64::from(MIN_VISIBLE)
    });
    if visible {
        return None;
    }
    let primary = primary?;
    let width = window.width.min(primary.width);
    let height = window.height.min(primary.height);
    Some(Rect {
        x: primary.x + half(primary.width - width),
        y: primary.y + half(primary.height - height),
        width,
        height,
    })
}

fn half(length: u32) -> i32 {
    i32::try_from(length / 2).unwrap_or(i32::MAX)
}

#[cfg(test)]
#[path = "window_place_tests.rs"]
mod tests;
