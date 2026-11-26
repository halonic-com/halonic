//! Keeps the list of open windows (`open_windows.rs`) up to date while
//! Halonic runs, and opens the recorded windows again at start.
//!
//! The list is read once at start (`start`), so it is kept up to date
//! however the first window opens. The list and the windows' places are
//! written as they change: when a window shows, hides, closes, or the focus
//! moves between app windows, and when Halonic starts quitting. Windows
//! doesn't tell Halonic when it shuts down (tao handles no `WM_ENDSESSION`),
//! so a shutdown writes nothing and leaves what was last written. Once Quit
//! starts, nothing more is written, since quitting closes every window.
//!
//! Each app window's page may keep a short content string here, what it
//! shows, through `window_content_set`, and read it back at start through
//! `window_content_get`. Both take the window from the call itself, never
//! from an argument, so a page only reaches its own window's string. The
//! shell never reads it.

use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, PoisonError};

use halonic_profile::join_path;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow, Window, WindowEvent};
use tauri_plugin_window_state::AppHandleExt;

use crate::focused_apps::{FocusedApp, STUDIO_WINDOW, window_labels};
use crate::open_windows::{self, OpenSet};

/// The open windows: where their list lives, once `start` found it, the
/// set, and whether a window moved since the places were last saved.
#[derive(Default)]
pub struct OpenWindowsState {
    tracked: Mutex<Tracked>,
}

#[derive(Default)]
struct Tracked {
    file: Option<PathBuf>,
    set: OpenSet,
    moved: bool,
}

/// Opens the window a start, the tray or quick ask's chat asks for
/// (Studio's for `None`, the one that had the focus in front when the first
/// one reopens the others). The first one in a run opens every window open
/// at the last quit with it, unless "Reopen windows on start" is off. Fails
/// only when the window asked for didn't open.
pub fn open<R: Runtime>(app: &AppHandle<R>, asked: Option<FocusedApp>) -> tauri::Result<()> {
    reopen(app, asked, asked.map(FocusedApp::name))
}

/// Opens Studio's window by name, as a run notification's click does: in
/// front of the windows the first one in a run reopens, whichever had the
/// focus. Fails only when Studio's window didn't open.
pub fn open_studio<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    reopen(app, None, Some(STUDIO_WINDOW))
}

/// Opens the window `asked` for, with the recorded ones on the first open,
/// `front` (or the one that had the focus) last, so it ends up in front.
fn reopen<R: Runtime>(
    app: &AppHandle<R>,
    asked: Option<FocusedApp>,
    front: Option<&str>,
) -> tauri::Result<()> {
    if asked == Some(FocusedApp::Ask) || !keeps_a_list(app) {
        return crate::focused_apps::show(app, asked);
    }
    let recorded = lock(app).set.first_open();
    if recorded.is_empty() || !reopens(app) {
        return crate::focused_apps::show(app, asked);
    }
    let order = open_windows::opening_order(&recorded, front);
    let Some((last, others)) = order.split_last() else {
        return crate::focused_apps::show(app, asked);
    };
    for label in others {
        if let Err(error) = crate::focused_apps::show(app, app_for(label)) {
            halonic_shell_log::record("window", format_args!("a window didn't reopen: {error}"));
        }
    }
    // The one in front is the one asked for: its error is the caller's.
    crate::focused_apps::show(app, app_for(last))
}

/// Sets the windows open at the last quit, as `start` would have read them:
/// the tests' apps read no profile.
#[cfg(test)]
pub fn seed<R: Runtime>(app: &AppHandle<R>, recorded: &[open_windows::OpenWindow]) {
    lock(app).set = OpenSet::from_recorded(recorded);
}

/// Reads the list at start, before any window opens, and remembers where it
/// lives so changes are written there. No profile means no list, and
/// nothing is written.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    // The tests' apps keep no list: they must not read or write the profile
    // of the computer that runs them (`open_windows_tests.rs` checks the
    // list's rules on their own).
    if cfg!(test) {
        return;
    }
    let file = match crate::profile::cli_profile(app) {
        Ok(profile) => PathBuf::from(join_path(
            profile.platform,
            &profile.root,
            &["studio", open_windows::FILE_NAME],
        )),
        Err(problem) => {
            halonic_shell_log::record("window", format_args!("no list of open windows: {problem}"));
            return;
        }
    };
    let recorded = open_windows::read(&file);
    let mut tracked = lock(app);
    tracked.file = Some(file);
    tracked.set = OpenSet::from_recorded(&recorded);
}

fn reopens<R: Runtime>(app: &AppHandle<R>) -> bool {
    // The tests' apps don't read the profile of the computer that runs them.
    if cfg!(test) {
        return true;
    }
    match crate::host_settings::saved_value(app, open_windows::SETTING) {
        Ok(saved) => open_windows::reopens(saved.as_ref()),
        Err(refusal) => {
            halonic_shell_log::record(
                "window",
                format_args!("the setting can't be read: {refusal:?}"),
            );
            true
        }
    }
}

/// The focused app whose window has `label`, or `None` for Studio's. Only
/// the app windows' labels come here (`open_windows::kept`).
fn app_for(label: &str) -> Option<FocusedApp> {
    if label == STUDIO_WINDOW {
        return None;
    }
    [FocusedApp::Inbox, FocusedApp::Messenger]
        .into_iter()
        .find(|app| app.name() == label)
}

/// A window changed: the list is written again when what shows, or the
/// app window last focused, changed.
pub fn window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    let app = window.app_handle();
    if !window_labels().contains(&window.label()) || !keeps_a_list(app) {
        return;
    }
    match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => lock(app).moved = true,
        WindowEvent::Focused(focused) => {
            noted(app, None);
            if !focused {
                save_places(app, false);
            }
        }
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
            noted(app, Some(window.label()));
            save_places(app, false);
        }
        _ => {}
    }
}

/// Halonic starts quitting: the list and the places are written one last
/// time, before any window closes.
pub fn quitting<R: Runtime>(app: &AppHandle<R>) {
    if !keeps_a_list(app) {
        return;
    }
    let showing = showing(app, None);
    let mut tracked = lock(app);
    let list = tracked.set.quit(&borrowed(&showing));
    write(&tracked, list);
    drop(tracked);
    save_places(app, true);
}

fn noted<R: Runtime>(app: &AppHandle<R>, leaving: Option<&str>) {
    let showing = showing(app, leaving);
    let mut tracked = lock(app);
    let list = tracked.set.note(&borrowed(&showing));
    write(&tracked, list);
}

/// The app windows that show, but `leaving`, and whether each has focus.
fn showing<R: Runtime>(app: &AppHandle<R>, leaving: Option<&str>) -> Vec<(String, bool)> {
    window_labels()
        .into_iter()
        .filter(|label| Some(*label) != leaving)
        .filter_map(|label| app.get_webview_window(label))
        .filter(|window| window.is_visible().unwrap_or(false))
        .map(|window| {
            (
                window.label().to_owned(),
                window.is_focused().unwrap_or(false),
            )
        })
        .collect()
}

fn borrowed(showing: &[(String, bool)]) -> Vec<(&str, bool)> {
    showing
        .iter()
        .map(|(label, focused)| (label.as_str(), *focused))
        .collect()
}

fn write(tracked: &Tracked, list: Option<Vec<open_windows::OpenWindow>>) {
    let (Some(file), Some(list)) = (&tracked.file, list) else {
        return;
    };
    if let Err(error) = open_windows::record(file, &list) {
        halonic_shell_log::record(
            "window",
            format_args!("the open windows weren't recorded: {error}"),
        );
    }
}

/// Saves the windows' places (`window_place.rs`) when one moved since the
/// last save, or always when Halonic quits; never before `start` found the
/// list, as on the tests' apps.
fn save_places<R: Runtime>(app: &AppHandle<R>, always: bool) {
    let (moved, tracking) = {
        let mut tracked = lock(app);
        (std::mem::take(&mut tracked.moved), tracked.file.is_some())
    };
    if !tracking || (!moved && !always) {
        return;
    }
    if let Err(error) = app.save_window_state(crate::window_place::kept()) {
        halonic_shell_log::record("window", format_args!("the places weren't saved: {error}"));
    }
}

/// Whether `app` manages the open windows' state: some of the tests' apps
/// don't, and only show their windows.
fn keeps_a_list<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<OpenWindowsState>().is_some()
}

fn lock<R: Runtime>(app: &AppHandle<R>) -> MutexGuard<'_, Tracked> {
    app.state::<OpenWindowsState>()
        .inner()
        .tracked
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
}

/// The `window_content_set` command: keeps what the calling app window
/// shows, at most 2 KB, ids and paths its page checks again, never a
/// secret or a file's text. Refused as `not_an_app_window` or `too_long`.
/// Async, so a change waiting for the disk never holds up the window.
#[tauri::command]
pub async fn window_content_set<R: Runtime>(
    window: WebviewWindow<R>,
    content: Option<String>,
) -> Result<(), &'static str> {
    lock(window.app_handle())
        .set
        .set_content(window.label(), content)?;
    noted(window.app_handle(), None);
    Ok(())
}

/// The `window_content_get` command: what the calling app window showed
/// at the last quit, or since; `None` when its page kept nothing.
#[tauri::command]
pub fn window_content_get<R: Runtime>(
    window: WebviewWindow<R>,
) -> Result<Option<String>, &'static str> {
    if !window_labels().contains(&window.label()) {
        return Err("not_an_app_window");
    }
    Ok(lock(window.app_handle()).set.content(window.label()))
}

#[cfg(test)]
#[path = "open_windows_track_tests.rs"]
mod tests;
