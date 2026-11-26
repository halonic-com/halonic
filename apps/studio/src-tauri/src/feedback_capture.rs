//! The feedback capture's native side (HAL-18778, sketch on HAL-18562).
//! The shortcut is heard only by the focused one of Studio's own windows, never
//! system-wide: the focused window's page asks `plugin:feedback|start`, which takes one
//! still of that window's own area, in memory, never in a file, and only
//! while that window is focused, so a page script in a window behind
//! another app can't capture what covers it. The page
//! then draws its see-through selection overlay over the live app and
//! hands the box to `plugin:feedback|select`; the Send feedback window
//! gets only that crop (`plugin:feedback|crop`). Where no still can be
//! taken yet, such as macOS or Linux on Wayland, `start` opens a small
//! window that says so.

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Instant;

use halonic_screen_still::{ScreenArea, StillError};
use serde::Serialize;
use tauri::async_runtime::Mutex as AsyncMutex;
use tauri::ipc::Response;
use tauri::plugin::TauriPlugin;
use tauri::webview::{WebviewWindow, WebviewWindowBuilder};
use tauri::{AppHandle, LogicalSize, Manager, Runtime, Webview, WindowEvent};

#[path = "feedback_held.rs"]
mod held;
#[path = "feedback_shortcut.rs"]
mod shortcut;
use held::{
    Capturing, Held, OpenWindows, Press, STILL_LIFETIME, SelectedBox, UNAVAILABLE_WINDOW,
    still_bytes,
};

/// The Send feedback window's label.
pub const FEEDBACK_WINDOW: &str = "feedback";

/// Whether `label` is one of Studio's own windows (Studio, Halonic Inbox,
/// Halonic Messenger), the only windows that may start a capture of their
/// own area and select from it.
fn studio_window(label: &str) -> bool {
    crate::focused_apps::window_labels().contains(&label)
}

/// What is held between the press and the send.
#[derive(Default)]
pub struct FeedbackCapture {
    held: Mutex<Held>,
    /// Held by a shortcut change until it is saved.
    changing: AsyncMutex<()>,
}

/// The `feedback` plugin, whose commands build.rs names, so each needs its
/// capability.
pub fn commands<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("feedback")
        .invoke_handler(tauri::generate_handler![
            start,
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

/// The size of the still `start` took, in device pixels, so the page can
/// turn its CSS pixels into the still's.
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
pub struct Started {
    pub width: u32,
    pub height: u32,
}

/// A press of the feedback shortcut in one of Studio's own windows. Brings the Send
/// feedback window forward when it is open (`send_open`); otherwise takes
/// one still of that window's own area and holds it. Refused as
/// `not_focused` unless the calling window is focused: the still is the
/// screen under the window, so a window behind another app would capture
/// that app. Refused as `busy` while a still is being taken, and as
/// `unavailable` (after opening the window that says so) where no still
/// can be taken. Async, because Windows can't open a window from a command
/// on the main thread.
#[tauri::command]
pub async fn start<R: Runtime>(window: WebviewWindow<R>) -> Result<Started, &'static str> {
    if !studio_window(window.label()) {
        return Err("not_a_studio_window");
    }
    if !window.is_focused().unwrap_or(false) {
        return Err("not_focused");
    }
    let app = window.app_handle().clone();
    let windows = app.webview_windows();
    let open = OpenWindows {
        send_feedback: windows.contains_key(FEEDBACK_WINDOW),
    };
    let press = held(&app).on_press(open);
    match press {
        Press::Ignore => Err("busy"),
        Press::ShowSendFeedback => {
            if let Some(send) = windows.get(FEEDBACK_WINDOW)
                && let Err(error) = send.set_focus()
            {
                log(format!(
                    "the Send feedback window didn't come forward: {error}"
                ));
            }
            Err("send_open")
        }
        Press::Capture => {
            let taking = app.clone();
            let taken = tauri::async_runtime::spawn_blocking(move || {
                let state = taking.state::<FeedbackCapture>();
                let _capturing = Capturing(&state.held);
                take_window_still(&taking, &window)
            })
            .await
            .map_err(|_| "failed")?;
            match taken {
                Ok(started) => Ok(started),
                Err(error) => {
                    if let Some(StillError::Unavailable) = error.downcast_ref::<StillError>() {
                        show_unavailable(&app);
                        Err("unavailable")
                    } else {
                        finish(&app);
                        log(format!("no screenshot was taken: {error}"));
                        Err("failed")
                    }
                }
            }
        }
    }
}

/// Takes the still of `window`'s own area, inside its frame, and holds it,
/// for that window only, for STILL_LIFETIME.
fn take_window_still<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
) -> Result<Started, Box<dyn std::error::Error>> {
    let position = window.inner_position()?;
    let size = window.inner_size()?;
    let area = ScreenArea {
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
    };
    let still = halonic_screen_still::take(&area)?;
    let started = Started {
        width: still.width,
        height: still.height,
    };
    let press = held(app).hold(still, window.label(), Instant::now());
    let timer = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(STILL_LIFETIME).await;
        held(&timer).expire(press);
    });
    Ok(started)
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
    // Closed any other way, such as Alt+F4 or a crashed page, the Send
    // feedback window drops the crop. Only its own press's: a window can
    // close after the next press took its still.
    // While the Send feedback window closes, a press takes a new capture.
    let closed = app.clone();
    let send_feedback = label == FEEDBACK_WINDOW;
    let press = held(app).press();
    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { .. } if send_feedback => {
            held(&closed).send_feedback_closing();
        }
        WindowEvent::Destroyed if send_feedback => {
            let mut held = held(&closed);
            held.clear_press(press);
            held.send_feedback_closed();
        }
        _ => {}
    });
    Ok(window)
}

/// Drops the still and the crop, and closes every feedback window.
fn finish<R: Runtime>(app: &AppHandle<R>) {
    held(app).clear();
    close_windows(app, |label| {
        label == FEEDBACK_WINDOW || label == UNAVAILABLE_WINDOW
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

/// Keeps the crop of `area` of the still the calling window's press took,
/// drops the still and opens the Send feedback window. Refused as
/// `other_window`, leaving what is held alone, when another window's press
/// took it, and as `gone`, ending the feedback, when there is no still.
/// Async, because Windows can't open a window from a command on the main
/// thread.
#[tauri::command]
pub async fn select<R: Runtime>(
    webview: Webview<R>,
    area: SelectedBox,
) -> Result<(), &'static str> {
    if !studio_window(webview.label()) {
        return Err("not_a_studio_window");
    }
    let app = webview.app_handle().clone();
    let selected = held(&app).select(webview.label(), area.into(), Instant::now());
    if let Err(refusal) = selected {
        if refusal == "gone" {
            finish(&app);
        }
        return Err(refusal);
    }
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
