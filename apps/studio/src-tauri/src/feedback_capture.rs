//! The feedback shortcut's native side (HAL-18778, sketch on HAL-18562).
//! Only a press of the shortcut takes a capture: one still of every
//! screen, in memory, never in a file. One borderless overlay opens on each
//! screen and gets only its own still (`plugin:feedback|still`); the Send
//! feedback window gets only the crop of the box the person drew
//! (`plugin:feedback|crop`). The shortcut is registered from Rust only: no
//! capability grants the global-shortcut plugin's commands, so no page can
//! register a key or hear one. Where no still can be taken yet, such as
//! macOS or Linux on Wayland, a press opens a small window that says so.

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Instant;

use halonic_screen_still::{ScreenArea, StillError};
use tauri::async_runtime::Mutex as AsyncMutex;
use tauri::ipc::Response;
use tauri::plugin::TauriPlugin;
use tauri::webview::{WebviewWindow, WebviewWindowBuilder};
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Runtime, Webview, WindowEvent,
};
use tauri_plugin_global_shortcut::Shortcut;

#[path = "feedback_held.rs"]
mod held;
#[path = "feedback_shortcut.rs"]
mod shortcut;
use held::{
    Capturing, Held, MAX_SCREENS, OVERLAY_PREFIX, OpenWindows, Press, STILL_LIFETIME, SelectedBox,
    UNAVAILABLE_WINDOW, overlay_index, still_bytes,
};
pub use shortcut::owns;

/// The Send feedback window's label.
pub const FEEDBACK_WINDOW: &str = "feedback";

/// What is held between the press and the send, and the shortcut.
#[derive(Default)]
pub struct FeedbackCapture {
    held: Mutex<Held>,
    shortcut: Mutex<Option<Shortcut>>,
    /// Held by a shortcut change until it is saved or put back.
    changing: AsyncMutex<()>,
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
            shortcut::register_saved(app);
            Ok(())
        })
        .build()
}

fn held<R: Runtime>(app: &AppHandle<R>) -> MutexGuard<'_, Held> {
    let state = app.state::<FeedbackCapture>().inner();
    state.held.lock().unwrap_or_else(PoisonError::into_inner)
}

/// A press: closes the overlays when they are open, brings the Send
/// feedback window forward when it is open, and otherwise takes the stills
/// and opens the overlays. A press while the stills are still being taken
/// does nothing.
pub fn pressed<R: Runtime>(app: &AppHandle<R>) {
    let windows = app.webview_windows();
    let open = OpenWindows {
        overlays: windows.keys().any(|label| overlay_index(label).is_some()),
        send_feedback: windows.contains_key(FEEDBACK_WINDOW),
    };
    let press = held(app).on_press(open);
    match press {
        Press::Ignore => {}
        Press::End => finish(app),
        Press::ShowSendFeedback => {
            if let Some(window) = windows.get(FEEDBACK_WINDOW)
                && let Err(error) = window.set_focus()
            {
                log(format!(
                    "the Send feedback window didn't come forward: {error}"
                ));
            }
        }
        Press::Capture => {
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let opened = {
                    let state = app.state::<FeedbackCapture>();
                    let _capturing = Capturing(&state.held);
                    open_overlays(&app)
                };
                let Err(error) = opened else {
                    return;
                };
                if let Some(StillError::Unavailable) = error.downcast_ref::<StillError>() {
                    show_unavailable(&app);
                } else {
                    finish(&app);
                    log(format!("no screenshot was taken: {error}"));
                }
            });
        }
    }
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

/// The small window that says screen capture isn't available on this
/// system yet, brought forward when it is already open.
fn show_unavailable<R: Runtime>(app: &AppHandle<R>) {
    let shown = match app.get_webview_window(UNAVAILABLE_WINDOW) {
        Some(window) => window.set_focus(),
        None => page_window(app, UNAVAILABLE_WINDOW).and_then(|window| {
            window.set_size(LogicalSize::new(440.0, 220.0))?;
            window.center()?;
            window.show()?;
            window.set_focus()
        }),
    };
    if let Err(error) = shown {
        log(format!("the not-available window didn't show: {error}"));
    }
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
    // drops every still and the Send feedback window the crop. Only its own
    // press's: a window can close after the next press took its stills.
    // While the Send feedback window closes, a press takes a new capture.
    let closed = app.clone();
    let overlay = overlay_index(label).is_some();
    let send_feedback = label == FEEDBACK_WINDOW;
    let press = held(app).press();
    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { .. } if send_feedback => {
            held(&closed).send_feedback_closing();
        }
        WindowEvent::Destroyed if overlay => held(&closed).drop_stills_of(press),
        WindowEvent::Destroyed if send_feedback => {
            let mut held = held(&closed);
            held.clear_press(press);
            held.send_feedback_closed();
        }
        _ => {}
    });
    Ok(window)
}

/// Drops the stills and the crop, and closes every feedback window.
fn finish<R: Runtime>(app: &AppHandle<R>) {
    held(app).clear();
    close_windows(app, |label| {
        overlay_index(label).is_some() || label == FEEDBACK_WINDOW || label == UNAVAILABLE_WINDOW
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

/// Ends the feedback: Esc, Cancel, a sent feedback, or "Not now" where
/// capture isn't available. Keeps nothing.
#[tauri::command]
pub fn end<R: Runtime>(app: AppHandle<R>) {
    finish(&app);
}

#[cfg(test)]
#[path = "feedback_press_tests.rs"]
mod press_tests;
#[cfg(test)]
#[path = "feedback_capture_tests.rs"]
mod tests;
