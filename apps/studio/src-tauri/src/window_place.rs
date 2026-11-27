//! Each window comes back where it was (HAL-19204, board request). Studio,
//! the Inbox and the Messenger are all Halonic.exe, and window managers
//! such as FancyZones keep one place per exe, so the shell keeps each
//! window's own: its position, size, maximised and fullscreen state, by its
//! label (tauri-plugin-window-state, `.window-state.json` in the app's
//! config folder). Only those three windows are kept; the feedback and
//! brief windows open where they always do.
//!
//! The plugin restores nothing by itself: `window.rs` calls `restore` on a
//! window that is still hidden, after its taskbar ID is set, so it shows in
//! its place at once. A place that isn't all on the connected screens' work
//! areas, say after a screen was unplugged or its resolution went down,
//! moves fully onto the screen it overlaps most, or to the middle of the primary screen
//! when it overlaps none (HAL-19534). Every rectangle is in physical pixels,
//! so screens at different scales compare in one unit. The plugin saves
//! each window's place when it closes (Studio's hides to the tray) and when
//! Halonic quits. Registered from Rust only: no capability grants its
//! commands, so no page can call them.

use tauri::plugin::TauriPlugin;
use tauri::{PhysicalPosition, PhysicalSize, Runtime, WebviewWindow};
use tauri_plugin_window_state::{Builder, StateFlags, WindowExt};

use crate::focused_apps::window_labels;

/// How far, in pixels at 100%, a window's frame may reach past a work
/// area's edge and still count as on it: Windows draws an invisible resize
/// border of about 7 pixels at 100% (14 at 200%) around every window, and a
/// window snapped to a screen's edge has it past that edge.
const FRAME_SLACK_AT_100: f64 = 8.0;

/// The frame slack in physical pixels on screens up to `scale_factor`.
fn frame_slack(scale_factor: f64) -> i64 {
    // At most a few dozen pixels, so the cast can't overflow.
    (FRAME_SLACK_AT_100 * scale_factor.max(1.0)).ceil() as i64
}

/// What the shell keeps of each window: never whether it shows, since
/// Studio's window hides to the tray and must not come back hidden.
pub fn kept() -> StateFlags {
    StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED | StateFlags::FULLSCREEN
}

/// Whether the window labelled `label` has its place kept.
pub fn is_kept(label: &str) -> bool {
    window_labels().contains(&label)
}

/// The key no window's place is kept under (see `place_key`).
pub const IN_FRAME: &str = "in-frame";

/// The key the window labelled `label` has its place kept under: its label,
/// or `IN_FRAME` for an Inbox or Messenger window inside its frame
/// (HAL-20468). Such a window sits at (0,0) in its frame, which keeps its
/// own place, so saving it would put the app at the screen's corner the
/// next time it opens without a frame.
pub fn place_key(label: &str) -> &str {
    #[cfg(windows)]
    if crate::app_frames::is_framed(label) {
        return IN_FRAME;
    }
    label
}

/// The window state plugin, keeping `kept()` of the windows `is_kept`
/// names, and restoring none by itself. Windows are matched by `place_key`,
/// on saving too, so a window in a frame is neither tracked nor saved.
pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    window_labels()
        .into_iter()
        .fold(Builder::new(), Builder::skip_initial_state)
        .with_state_flags(kept())
        .map_label(place_key)
        .with_filter(is_kept)
        .build()
}

/// Puts the hidden `window` back in its kept place, moved fully onto a
/// screen when that place isn't. A place that can't be read or set leaves
/// the window where the system put it.
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
    let monitors = window.available_monitors()?;
    let screens: Vec<Rect> = monitors
        .iter()
        .map(|monitor| Rect::new(monitor.work_area().position, monitor.work_area().size))
        .collect();
    let slack = frame_slack(
        monitors
            .iter()
            .map(tauri::Monitor::scale_factor)
            .fold(1.0, f64::max),
    );
    let primary = window
        .primary_monitor()?
        .map(|monitor| Rect::new(monitor.work_area().position, monitor.work_area().size));
    let outer = window.outer_size()?;
    let current = Rect::new(window.outer_position()?, outer);
    if window.is_fullscreen()? || window.is_maximized()? {
        return keep_stretched_on_screen(window, current, &screens, primary);
    }
    let Some(place) = fallback(current, &screens, primary, slack) else {
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

/// A maximised or fullscreen window whose screen is gone opens the same way
/// on the primary screen: it is put back to normal, moved, and stretched
/// again, since a stretched window can't be moved.
fn keep_stretched_on_screen<R: Runtime>(
    window: &WebviewWindow<R>,
    current: Rect,
    screens: &[Rect],
    primary: Option<Rect>,
) -> tauri::Result<()> {
    let Some(place) = stretched_fallback(current, screens, primary) else {
        return Ok(());
    };
    let fullscreen = window.is_fullscreen()?;
    if fullscreen {
        window.set_fullscreen(false)?;
    } else {
        window.unmaximize()?;
    }
    window.set_position(PhysicalPosition::new(place.x, place.y))?;
    if fullscreen {
        window.set_fullscreen(true)
    } else {
        window.maximize()
    }
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

    fn right(self) -> i64 {
        i64::from(self.x) + i64::from(self.width)
    }

    fn bottom(self) -> i64 {
        i64::from(self.y) + i64::from(self.height)
    }

    /// How many pixels of it are on `other`.
    fn overlap(self, other: Rect) -> i64 {
        let across = self.right().min(other.right()) - i64::from(self.x.max(other.x));
        let down = self.bottom().min(other.bottom()) - i64::from(self.y.max(other.y));
        across.max(0) * down.max(0)
    }

    fn area(self) -> i64 {
        i64::from(self.width) * i64::from(self.height)
    }

    /// It with `slack` pixels taken off each side.
    fn inset(self, slack: i64) -> Rect {
        let slack_i32 = i32::try_from(slack).unwrap_or(i32::MAX);
        let slack_u32 = u32::try_from(slack.saturating_mul(2)).unwrap_or(u32::MAX);
        Rect {
            x: self.x.saturating_add(slack_i32),
            y: self.y.saturating_add(slack_i32),
            width: self.width.saturating_sub(slack_u32),
            height: self.height.saturating_sub(slack_u32),
        }
    }

    /// Whether all of it is on `screens` together, give or take `slack`
    /// pixels of the frame's invisible border. Work areas don't overlap, so
    /// it is covered when its overlaps with them add up to its own area.
    fn is_on(self, screens: &[Rect], slack: i64) -> bool {
        let inner = self.inset(slack);
        let covered: i64 = screens.iter().map(|screen| inner.overlap(*screen)).sum();
        covered >= inner.area()
    }

    /// Whether its middle is on `screen`.
    fn centre_is_on(self, screen: Rect) -> bool {
        let centre_x = i64::from(self.x) + i64::from(self.width / 2);
        let centre_y = i64::from(self.y) + i64::from(self.height / 2);
        (i64::from(screen.x)..screen.right()).contains(&centre_x)
            && (i64::from(screen.y)..screen.bottom()).contains(&centre_y)
    }
}

/// Where `window` goes, given the screens' work areas: `None` to keep it,
/// when all of it, give or take `slack` pixels, is on `screens` together,
/// even across two of them. Otherwise fully onto the screen
/// it overlaps most, as near its place as fits and no bigger than that
/// screen, or, when it overlaps none, the middle of `primary`'s work area.
/// `None` too when there is no `primary` screen to move it to.
pub fn fallback(window: Rect, screens: &[Rect], primary: Option<Rect>, slack: i64) -> Option<Rect> {
    if window.is_on(screens, slack) {
        return None;
    }
    let nearest = screens
        .iter()
        .copied()
        .filter(|screen| window.overlap(*screen) > 0)
        .max_by_key(|screen| window.overlap(*screen));
    if let Some(screen) = nearest {
        return Some(inside(window, screen));
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

/// Where a maximised or fullscreen `window` goes: `None` to keep it, when
/// its middle is on one of `screens`; otherwise `primary`'s work area, to
/// stretch over again. `None` too when there is no `primary` screen.
pub fn stretched_fallback(window: Rect, screens: &[Rect], primary: Option<Rect>) -> Option<Rect> {
    if screens.iter().any(|screen| window.centre_is_on(*screen)) {
        return None;
    }
    primary
}

/// `window` shrunk to fit `screen` and moved just far enough to be all on it.
fn inside(window: Rect, screen: Rect) -> Rect {
    let width = window.width.min(screen.width);
    let height = window.height.min(screen.height);
    Rect {
        x: window.x.clamp(
            screen.x,
            screen.x.saturating_add(span(screen.width - width)),
        ),
        y: window.y.clamp(
            screen.y,
            screen.y.saturating_add(span(screen.height - height)),
        ),
        width,
        height,
    }
}

fn span(length: u32) -> i32 {
    i32::try_from(length).unwrap_or(i32::MAX)
}

fn half(length: u32) -> i32 {
    span(length / 2)
}

#[cfg(test)]
#[path = "window_place_tests.rs"]
mod tests;
