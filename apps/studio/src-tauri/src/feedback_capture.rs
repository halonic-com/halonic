//! The feedback shortcut's native side (HAL-18778, sketch on HAL-18562).
//! Only a press of the shortcut takes a capture: one still of every
//! screen, in memory, never in a file. One borderless overlay opens on each
//! screen and gets only its own still (`plugin:feedback|still`); the Send
//! feedback window gets only the crop of the box the person drew
//! (`plugin:feedback|crop`). The shortcut is registered from Rust only: no
//! capability grants the global-shortcut plugin's commands, so no page can
//! register a key or hear one.

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Instant;

use halonic_screen_still::{ScreenArea, StillError};
use tauri::ipc::Response;
use tauri::plugin::TauriPlugin;
use tauri::webview::{WebviewWindow, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, Webview, WindowEvent};
use tauri_plugin_global_shortcut::Shortcut;

#[path = "feedback_held.rs"]
mod held;
#[path = "feedback_shortcut.rs"]
mod shortcut;
use held::{
    Held, MAX_SCREENS, OVERLAY_PREFIX, STILL_LIFETIME, SelectedBox, overlay_index, still_bytes,
};
pub use shortcut::keys;

/// The Send feedback window's label.
pub const FEEDBACK_WINDOW: &str = "feedback";

/// What is held between the press and the send, and the shortcut.
#[derive(Default)]
pub struct FeedbackCapture {
    held: Mutex<Held>,
    shortcut: Mutex<Option<Shortcut>>,
}

/// The `feedback` plugin, whose commands build.rs names, so each needs its
/// capability.
pub fn commands<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("feedback")
        .invoke_handler(tauri::generate_handler![
            still,
            select,
            crop,
            end,
            shortcut::shortcut_set
        ])
        .setup(|app, _api| {
            app.manage(FeedbackCapture::default());
            Ok(())
        })
        .build()
}

fn held<R: Runtime>(app: &AppHandle<R>) -> MutexGuard<'_, Held> {
    let state = app.state::<FeedbackCapture>().inner();
    state.held.lock().unwrap_or_else(PoisonError::into_inner)
}

/// A press: closes the overlays when they are open, otherwise takes the
/// stills and opens them.
fn pressed<R: Runtime>(app: &AppHandle<R>) {
    let open = app
        .webview_windows()
        .keys()
        .any(|label| overlay_index(label).is_some());
    if open {
        finish(app);
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = open_overlays(&app) {
            finish(&app);
            log(format!("no screenshot was taken: {error}"));
        }
    });
}

/// Takes every screen's still before any overlay shows, then opens one
/// overlay on each screen.
fn open_overlays<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let areas: Vec<ScreenArea> = app
        .available_monitors()?
        .iter()
        .take(MAX_SCREENS)
        .map(|monitor| ScreenArea {
            left: monitor.position().x,
            top: monitor.position().y,
            width: monitor.size().width,
            height: monitor.size().height,
            scale: monitor.scale_factor(),
        })
        .collect();
    let stills = areas
        .iter()
        .map(halonic_screen_still::take)
        .collect::<Result<Vec<_>, StillError>>()?;
    let press = held(app).hold(stills, Instant::now());
    let timer = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(STILL_LIFETIME).await;
        if held(&timer).expire(press) {
            close_windows(&timer, |label| overlay_index(label).is_some());
        }
    });
    for (index, area) in areas.iter().enumerate() {
        let window = page_window(app, &format!("{OVERLAY_PREFIX}{index}"))?;
        window.set_position(PhysicalPosition::new(area.left, area.top))?;
        window.set_size(PhysicalSize::new(area.width, area.height))?;
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}

/// A hidden, borderless, always-on-top window on the app's own page.
fn page_window<R: Runtime>(app: &AppHandle<R>, label: &str) -> tauri::Result<WebviewWindow<R>> {
    let mut config = crate::window::app_window_config(app);
    config.label = label.to_owned();
    config.visible = false;
    config.decorations = false;
    config.always_on_top = true;
    config.skip_taskbar = true;
    config.resizable = false;
    let window = WebviewWindowBuilder::from_config(app, &config)?.build()?;
    // Closed any other way, such as Alt+F4 or a crashed page, an overlay
    // drops every still and the Send feedback window the crop.
    let closed = app.clone();
    let overlay = overlay_index(label).is_some();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let mut held = held(&closed);
            if overlay {
                held.drop_stills()
            } else {
                held.clear()
            }
        }
    });
    Ok(window)
}

/// Drops the stills and the crop, and closes the overlays and the Send
/// feedback window.
fn finish<R: Runtime>(app: &AppHandle<R>) {
    held(app).clear();
    close_windows(app, |label| {
        overlay_index(label).is_some() || label == FEEDBACK_WINDOW
    });
}

/// Closes every window whose label `closes` picks.
fn close_windows<R: Runtime>(app: &AppHandle<R>, closes: impl Fn(&str) -> bool) {
    for (label, window) in app.webview_windows() {
        if closes(&label)
            && let Err(error) = window.close()
        {
            log(format!("{label} didn't close: {error}"));
        }
    }
}

fn log(message: String) {
    halonic_shell_log::record("feedback", message);
}

/// The calling overlay's still. Refused as `gone` once it was dropped.
#[tauri::command]
pub fn still<R: Runtime>(webview: Webview<R>) -> Result<Response, &'static str> {
    let index = overlay_index(webview.label()).ok_or("not_an_overlay")?;
    let mut held = held(webview.app_handle());
    let still = held.still(index, Instant::now()).ok_or("gone")?;
    Ok(Response::new(still_bytes(still)))
}

/// Keeps the crop of `area` of the calling overlay's still, drops every
/// still, closes the overlays and opens the Send feedback window. Async,
/// because Windows can't open a window from a command on the main thread.
#[tauri::command]
pub async fn select<R: Runtime>(
    webview: Webview<R>,
    area: SelectedBox,
) -> Result<(), &'static str> {
    let index = overlay_index(webview.label()).ok_or("not_an_overlay")?;
    let app = webview.app_handle().clone();
    if !held(&app).select(index, area.into(), Instant::now()) {
        finish(&app);
        return Err("gone");
    }
    close_windows(&app, |label| overlay_index(label).is_some());
    let window = page_window(&app, FEEDBACK_WINDOW).map_err(|_| "failed")?;
    window
        .center()
        .and_then(|()| window.show())
        .map_err(|_| "failed")
}

/// The crop, for the Send feedback window, or `gone`.
#[tauri::command]
pub fn crop<R: Runtime>(app: AppHandle<R>) -> Result<Response, &'static str> {
    let held = held(&app);
    held.crop()
        .map(|crop| Response::new(still_bytes(crop)))
        .ok_or("gone")
}

/// Ends the feedback: Esc, Cancel, or a sent feedback. Keeps nothing.
#[tauri::command]
pub fn end<R: Runtime>(app: AppHandle<R>) {
    finish(&app);
}

#[cfg(test)]
#[path = "feedback_capture_tests.rs"]
mod tests;
