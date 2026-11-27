//! Halonic Inbox's and Halonic Messenger's frames on Windows (HAL-20468,
//! `halonic-app-frame`). Window managers such as FancyZones keep one place
//! per exe, so each app's window sits in a small frame process of its own,
//! `Halonic Inbox.exe` or `Halonic Messenger.exe`, while its page still runs
//! here, with Studio's engine and connection.
//!
//! - A frame starts Halonic with `--app <name> --host-window <handle>`.
//!   `hand_over` keeps that handle, and `show` then opens the app's window
//!   as a child of the frame, once the frame proves to be that app's own
//!   exe in Halonic's folder, by file identity. Anything else is refused
//!   and left alone, and the window opens here instead.
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
use tauri::{AppHandle, Manager, Runtime, WebviewWindow, WindowEvent};

use crate::focused_apps::FocusedApp;

/// The frames handed over by starts, by app, until their windows open.
static HANDED: Mutex<Vec<(FrameApp, isize)>> = Mutex::new(Vec::new());

/// The labels of the windows that sit in a frame now.
static FRAMED: Mutex<Vec<&'static str>> = Mutex::new(Vec::new());

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
        // The handle came from the command line and could be any window,
        // so it is left alone: a frame of ours closes itself unanswered.
        halonic_shell_log::record("window", "a frame named no app with a frame");
        return;
    };
    if let Ok(mut handed) = HANDED.lock() {
        handed.retain(|(kept, _)| *kept != app);
        handed.push((app, frame));
    }
}

/// Shows `app`'s window through its frame: in the frame handed over, or by
/// starting its frame. `None` when `app` has no frame in this install, the
/// frame handed over was refused, or its window is open already: the
/// caller then opens it or brings it forward here.
pub fn show<R: Runtime>(handle: &AppHandle<R>, app: FocusedApp) -> Option<tauri::Result<()>> {
    let frame_app = frame_app(app)?;
    if let Some(frame) = take_handed(frame_app) {
        return adopt(handle, app, frame_app, frame);
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
/// `None` when it isn't: the window then opens here, so a frame refused,
/// say from an install folder whose file can't be read, never keeps the
/// app from opening.
fn adopt<R: Runtime>(
    handle: &AppHandle<R>,
    app: FocusedApp,
    frame_app: FrameApp,
    frame: isize,
) -> Option<tauri::Result<()>> {
    let trusted = halonic_app_frame::process_image(frame)
        .zip(own_folder())
        .is_some_and(|(image, folder)| {
            halonic_app_frame::is_frame_exe(
                &image,
                &folder,
                frame_app,
                halonic_app_frame::same_file,
            )
        });
    if !trusted {
        // The handle came from the command line and could be any window,
        // so it is left alone: a frame of ours closes itself unanswered.
        halonic_shell_log::record(
            "window",
            format!(
                "a window that isn't {}'s frame was refused; it opens here",
                app.title()
            ),
        );
        return None;
    }
    if let Some(window) = handle.get_webview_window(app.name()) {
        // Opened here before its frame came: it stays, and the new frame goes.
        let _ = halonic_app_frame::close(frame);
        return Some(bring_forward(&window));
    }
    Some(open_in_frame(handle, app, frame))
}

/// Opens `app`'s window in `frame`, marked as in a frame until it is gone,
/// so its kept place isn't saved over (`window_place::place_key`).
fn open_in_frame<R: Runtime>(
    handle: &AppHandle<R>,
    app: FocusedApp,
    frame: isize,
) -> tauri::Result<()> {
    set_framed(app.name(), true);
    let window = match crate::window::open_in_frame(handle, app, frame) {
        Ok(window) => window,
        Err(error) => {
            set_framed(app.name(), false);
            return Err(error);
        }
    };
    let label = app.name();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            set_framed(label, false);
        }
    });
    Ok(())
}

/// Whether the window labelled `label` sits in a frame.
pub fn is_framed(label: &str) -> bool {
    FRAMED.lock().is_ok_and(|framed| framed.contains(&label))
}

fn set_framed(label: &'static str, framed: bool) {
    let Ok(mut labels) = FRAMED.lock() else {
        return;
    };
    labels.retain(|kept| *kept != label);
    if framed {
        labels.push(label);
    }
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
    fn a_window_in_a_frame_has_no_place_kept_until_it_is_gone() {
        use crate::window_place::{IN_FRAME, is_kept, place_key};
        assert_eq!(place_key("inbox"), "inbox");
        set_framed("inbox", true);
        assert!(is_framed("inbox"));
        assert_eq!(place_key("inbox"), IN_FRAME);
        assert!(!is_kept(place_key("inbox")));
        assert_eq!(place_key("messenger"), "messenger");
        set_framed("inbox", false);
        assert_eq!(place_key("inbox"), "inbox");
    }

    #[test]
    fn a_handed_frame_is_kept_once_per_app_and_taken_once() {
        hand_over(&["Halonic.exe", "--app", "messenger", "--host-window", "11"]);
        hand_over(&["Halonic.exe", "--app", "messenger", "--host-window", "12"]);
        assert_eq!(take_handed(FrameApp::Messenger), Some(12));
        assert_eq!(take_handed(FrameApp::Messenger), None);
    }
}
