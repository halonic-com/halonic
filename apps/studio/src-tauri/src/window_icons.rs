//! A focused app's window icons on Windows (HAL-19716). Tauri's `set_icon`
//! sets only a window's small icon, shrunk from the 64 px image, so the
//! taskbar and Alt+Tab took the large icon from the exe, which is Halonic's.
//! Here the window gets both from its app's .ico, at the sizes its display
//! asks for, again when it moves to a display of another scale, and the
//! icons are destroyed once the window is gone.

use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

use halonic_window_app_id::WindowIcons;
use tauri::{Manager, Runtime, WebviewWindow, WindowEvent};

use crate::focused_apps::FocusedApp;

/// Each window's icons, by its label, held until the window is gone.
#[derive(Default)]
struct HeldIcons(Mutex<HashMap<String, WindowIcons>>);

/// Gives `window` its app's small and large icons, and keeps them right
/// for its display. Falls back to the 64 px icon when Windows refuses.
pub fn set<R: Runtime>(window: &WebviewWindow<R>, app: FocusedApp) {
    if window.try_state::<HeldIcons>().is_none() {
        window.manage(HeldIcons::default());
    }
    apply(window, app, window.scale_factor());
    let handle = window.app_handle().clone();
    let label = window.label().to_owned();
    window.on_window_event(move |event| match event {
        WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
            if let Some(window) = handle.get_webview_window(&label) {
                apply(&window, app, Ok(*scale_factor));
            }
        }
        // The window no longer uses them, so they can go.
        WindowEvent::Destroyed => drop(held(&handle).remove(&label)),
        _ => {}
    });
}

/// Sets `window`'s icons from `app`'s .ico at `scale`, then lets go of the
/// ones it had, which the window no longer uses.
fn apply<R: Runtime>(window: &WebviewWindow<R>, app: FocusedApp, scale: tauri::Result<f64>) {
    let Some(ico) = app.ico() else {
        return;
    };
    let icons = scale
        .and_then(|scale| Ok((window.hwnd()?.0, scale)))
        .map_err(|error| error.to_string())
        .and_then(|(hwnd, scale)| halonic_window_app_id::set_icons(hwnd, ico, dpi(scale)));
    match icons {
        Ok(icons) => drop(held(window).insert(window.label().to_owned(), icons)),
        Err(error) => {
            halonic_shell_log::record("window", format!("the window's icons didn't set: {error}"));
            fall_back(window, app);
        }
    }
}

/// Tauri's small icon from the 64 px image, as before HAL-19716.
fn fall_back<R: Runtime>(window: &WebviewWindow<R>, app: FocusedApp) {
    if let Some(icon) = app.icon()
        && let Err(error) = window.set_icon(icon)
    {
        halonic_shell_log::record("window", format!("the window's icon didn't set: {error}"));
    }
}

fn held<R: Runtime, M: Manager<R>>(
    manager: &M,
) -> std::sync::MutexGuard<'_, HashMap<String, WindowIcons>> {
    manager
        .state::<HeldIcons>()
        .inner()
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
}

/// The dots per inch of a display at `scale` (1.0 is 96 dpi).
fn dpi(scale: f64) -> u32 {
    (96.0 * scale).round() as u32
}
