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

/// Opens the window `asked` for (Studio's for `None`): a start, the tray,
/// a notification's click or quick ask's chat. The first one in a run opens
/// every window open at the last quit with it, the one asked for in front,
/// unless "Reopen windows on start" is off.
pub fn open<R: Runtime>(app: &AppHandle<R>, asked: Option<FocusedApp>) -> tauri::Result<()> {
    if asked == Some(FocusedApp::Ask) {
        return crate::focused_apps::show(app, asked);
    }
    if !keeps_a_list(app) {
        return crate::focused_apps::show(app, asked);
    }
    let recorded = lock(app).set.first_open();
    if recorded.is_empty() || !reopens(app) {
        return crate::focused_apps::show(app, asked);
    }
    let order = open_windows::opening_order(&recorded, asked.map(FocusedApp::name));
    for label in &order {
        if let Err(error) = crate::focused_apps::show(app, app_for(label)) {
            halonic_shell_log::record("window", format_args!("a window didn't reopen: {error}"));
        }
    }
    Ok(())
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
#[tauri::command]
pub fn window_content_set<R: Runtime>(
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
