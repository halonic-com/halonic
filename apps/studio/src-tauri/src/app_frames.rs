//! Halonic Inbox's and Halonic Messenger's frames on Windows (HAL-20468,
//! `halonic-app-frame`). Window managers such as FancyZones keep one place
//! per exe, so each app's window sits in a small frame process of its own,
//! `Halonic Inbox.exe` or `Halonic Messenger.exe`, while its page still runs
//! here, with Studio's engine and connection.
//!
//! - A frame starts Halonic with `--app <name> --host-window <handle>`.
//!   `hand_over` keeps that handle, and `show` then opens the app's window
//!   as a child of the frame, once the frame proves to be that app's own
//!   exe in Halonic's folder. Anything else is refused and its frame closed.
//! - Any other start of the app, such as `--app inbox` from an old shortcut,
//!   the tray, quick ask's chat or the windows reopened at start, starts the
//!   app's frame instead of opening a window here, when this install has
//!   one. Without one (a build that doesn't ship them), the window opens
//!   here, as before.
//! - A window in a frame gives the frame the page's title and title bar
//!   colour, and comes forward through it.

use std::path::PathBuf;
use std::sync::Mutex;

use halonic_app_frame::FrameApp;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

use crate::focused_apps::FocusedApp;

/// The frames handed over by starts, by app, until their windows open.
static HANDED: Mutex<Vec<(FrameApp, isize)>> = Mutex::new(Vec::new());

/// The frame app for `app`, or `None` for quick ask, which has none.
pub fn frame_app(app: FocusedApp) -> Option<FrameApp> {
    match app {
        FocusedApp::Inbox => Some(FrameApp::Inbox),
        FocusedApp::Messenger => Some(FrameApp::Messenger),
        FocusedApp::Ask => None,
    }
}

/// Keeps the frame a start's `arguments` hand over, if any, for `show`.
pub fn hand_over<S: AsRef<str>>(arguments: &[S]) {
    let Some(frame) = halonic_app_frame::host_window(arguments) else {
        return;
    };
    let Some(app) = crate::focused_apps::requested(arguments).and_then(frame_app) else {
        halonic_shell_log::record("window", "a frame named no app with a frame");
        let _ = halonic_app_frame::close(frame);
        return;
    };
    if let Ok(mut handed) = HANDED.lock() {
        handed.retain(|(kept, _)| *kept != app);
        handed.push((app, frame));
    }
}

/// Shows `app`'s window through its frame: in the frame handed over, or by
/// starting its frame. `None` when `app` has no frame in this install, or
/// its window is open already: the caller then opens it or brings it
/// forward here.
pub fn show<R: Runtime>(handle: &AppHandle<R>, app: FocusedApp) -> Option<tauri::Result<()>> {
    let frame_app = frame_app(app)?;
    if let Some(frame) = take_handed(frame_app) {
        return Some(adopt(handle, app, frame_app, frame));
    }
    if handle.get_webview_window(app.name()).is_some() {
        return None;
    }
    let folder = own_folder()?;
    match halonic_app_frame::start_frame(&folder, frame_app) {
        Ok(started) => started.then_some(Ok(())),
        Err(error) => {
            // The window opens here instead, as it did before the frames.
            halonic_shell_log::record(
                "window",
                format!("{}'s frame didn't start: {error}", app.title()),
            );
            None
        }
    }
}

fn take_handed(app: FrameApp) -> Option<isize> {
    let mut handed = HANDED.lock().ok()?;
    let position = handed.iter().position(|(kept, _)| *kept == app)?;
    Some(handed.remove(position).1)
}

/// Opens `app`'s window in `frame`, once it is that app's own frame.
fn adopt<R: Runtime>(
    handle: &AppHandle<R>,
    app: FocusedApp,
    frame_app: FrameApp,
    frame: isize,
) -> tauri::Result<()> {
    let trusted = halonic_app_frame::process_image(frame)
        .zip(own_folder())
        .is_some_and(|(image, folder)| halonic_app_frame::is_frame_exe(&image, &folder, frame_app));
    if !trusted {
        halonic_shell_log::record("window", "a window that isn't Halonic's frame was refused");
        let _ = halonic_app_frame::close(frame);
        return Ok(());
    }
    if let Some(window) = handle.get_webview_window(app.name()) {
        // Opened here before its frame came: it stays, and the new frame goes.
        let _ = halonic_app_frame::close(frame);
        return bring_forward(&window);
    }
    crate::window::open_in_frame(handle, app, frame).map(|_| ())
}

/// The folder Halonic's exe is in, where the installer puts the frames.
fn own_folder() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()?
        .parent()
        .map(ToOwned::to_owned)
}

/// The frame `window` sits in, or `None` when it is a window of its own.
pub fn frame_of<R: Runtime>(window: &WebviewWindow<R>) -> Option<isize> {
    let own = window.hwnd().ok()?.0 as isize;
    let root = halonic_app_frame::root(own);
    (root != own).then_some(root)
}

/// Brings `window` forward: its frame, when it sits in one, with the focus
/// on the window; otherwise the window itself.
pub fn bring_forward<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let Some(frame) = frame_of(window) else {
        window.unminimize()?;
        window.show()?;
        return window.set_focus();
    };
    if let Err(error) = halonic_app_frame::bring_forward(frame) {
        halonic_shell_log::record("window", error);
    }
    window.set_focus()
}

/// Gives `window`'s frame the title `title`, when it sits in one.
pub fn set_frame_title<R: Runtime>(window: &WebviewWindow<R>, title: &str) {
    if let Some(frame) = frame_of(window)
        && let Err(error) = halonic_app_frame::set_text(frame, title)
    {
        halonic_shell_log::record("window", error);
    }
}

/// Asks `window`'s frame to colour its title bar `caption`. `None` when the
/// window sits in no frame and colours its own bar.
pub fn colour_frame<R: Runtime>(
    window: &WebviewWindow<R>,
    caption: halonic_window_caption::Rgb,
) -> Option<Result<(), String>> {
    frame_of(window).map(|frame| halonic_app_frame::colour_caption(frame, caption))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inbox_and_messenger_have_frames_and_quick_ask_has_none() {
        assert_eq!(frame_app(FocusedApp::Inbox), Some(FrameApp::Inbox));
        assert_eq!(frame_app(FocusedApp::Messenger), Some(FrameApp::Messenger));
        assert_eq!(frame_app(FocusedApp::Ask), None);
        for app in [FocusedApp::Inbox, FocusedApp::Messenger] {
            let frame = frame_app(app).expect("a frame");
            assert_eq!(frame.name(), app.name());
            assert_eq!(frame.title(), app.title());
        }
    }

    #[test]
    fn a_handed_frame_is_kept_once_per_app_and_taken_once() {
        hand_over(&["Halonic.exe", "--app", "messenger", "--host-window", "11"]);
        hand_over(&["Halonic.exe", "--app", "messenger", "--host-window", "12"]);
        assert_eq!(take_handed(FrameApp::Messenger), Some(12));
        assert_eq!(take_handed(FrameApp::Messenger), None);
    }
}
