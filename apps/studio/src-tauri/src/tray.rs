//! The tray / menu-bar icon (B1 step 5, design note D7 and D9, board card
//! HAL-14213): the Halonic ring with the engines' state, and a menu to open
//! Halonic, start stopped engines again, or quit. Closing Studio's window
//! hides it and Halonic keeps running here; Quit Halonic stops every engine
//! first. When the desktop has no tray, nothing changes: closing the window
//! quits, as before (security review, HAL-14212).
//!
//! What it shows is `tray_status`; this file only applies it.

use std::panic::{self, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, PoisonError};
use std::thread;

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, CloseRequestApi, ExitRequestApi, Manager, RunEvent, Runtime, Window};

use crate::tray_status::{
    IconScheme, IconState, MenuLine, OPEN, PAUSE, QUIT, RESUME, STATUS, TRY_AGAIN, TrayView,
    hides_on_close, keeps_running_in_tray, stays_in_tray, tray_view,
};

/// The tray icon's id.
const TRAY_ID: &str = "halonic";

/// Whether Halonic keeps running in the tray, whether Quit started,
/// whether Halonic is exiting (no more redraws), and what the tray shows
/// now, so a health that changes nothing redraws nothing.
#[derive(Default)]
pub struct TrayShellState {
    background: AtomicBool,
    quitting: AtomicBool,
    exiting: AtomicBool,
    view: Mutex<Option<TrayView>>,
}

/// Shows the tray icon, at start. A desktop with no tray is logged, and
/// Halonic then quits when its window closes.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    // The tests' apps run on the mock runtime, which has no tray.
    if cfg!(test) {
        return;
    }
    let view = tray_view(crate::engines::summary(app), false);
    // On Linux the tray library panics when neither appindicator library is
    // installed: that is a desktop with no tray, not a reason to stop.
    let built = panic::catch_unwind(AssertUnwindSafe(|| {
        build(app, &view).map_err(|error| error.to_string())
    }))
    .unwrap_or_else(|_| Err("the tray library didn't load".to_owned()));
    match built {
        Ok(_) => {
            let state = app.state::<TrayShellState>();
            let background = keeps_running_in_tray(std::env::consts::OS);
            state.background.store(background, Ordering::SeqCst);
            *lock(&state.view) = Some(view);
        }
        Err(error) => halonic_shell_log::record(
            "tray",
            format_args!("no tray icon, so closing the window quits: {error}"),
        ),
    }
}

fn build<R: Runtime>(app: &AppHandle<R>, view: &TrayView) -> tauri::Result<TrayIcon<R>> {
    let scheme = scheme();
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon(scheme, view.icon))
        .icon_as_template(scheme == IconScheme::Template)
        .tooltip("Halonic")
        .menu(&menu(app, view)?)
        .on_menu_event(|app, event| clicked(app, event.id().as_ref()))
        .build(app)
}

/// Redraws the tray after the engines changed: a health, a crash, a start.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let Some(state) = app.try_state::<TrayShellState>() else {
        return;
    };
    if state.exiting.load(Ordering::SeqCst) {
        return;
    }
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let view = tray_view(
        crate::engines::summary(app),
        state.quitting.load(Ordering::SeqCst),
    );
    let mut shown = lock(&state.view);
    if shown.as_ref() == Some(&view) {
        return;
    }
    if let Err(error) = apply(app, &tray, &view) {
        halonic_shell_log::record("tray", format_args!("the tray wasn't redrawn: {error}"));
        return;
    }
    *shown = Some(view);
}

fn apply<R: Runtime>(app: &AppHandle<R>, tray: &TrayIcon<R>, view: &TrayView) -> tauri::Result<()> {
    tray.set_icon(Some(icon(scheme(), view.icon)))?;
    tray.set_icon_as_template(scheme() == IconScheme::Template)?;
    tray.set_menu(Some(menu(app, view)?))
}

fn menu<R: Runtime>(app: &AppHandle<R>, view: &TrayView) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;
    for line in &view.menu {
        match line {
            MenuLine::Separator => menu.append(&PredefinedMenuItem::separator(app)?)?,
            MenuLine::Item { id, text, enabled } => {
                menu.append(&MenuItem::with_id(
                    app,
                    id.as_str(),
                    text,
                    *enabled,
                    None::<&str>,
                )?)?;
            }
        }
    }
    Ok(menu)
}

/// A menu item was clicked. Starting engines and quitting wait on them, so
/// they run off the tray's thread.
fn clicked<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if id == OPEN || id.starts_with(STATUS) {
        crate::focused_apps::started_again(app, &[]);
    } else if id == TRY_AGAIN {
        let app = app.clone();
        thread::spawn(move || crate::engines::try_again(&app));
    } else if id == PAUSE || id == RESUME {
        let (app, paused) = (app.clone(), id == PAUSE);
        thread::spawn(move || crate::engines::pause_routines(&app, paused));
    } else if id == QUIT {
        quit(app);
    }
}

/// Quit Halonic: the menu shows "Quitting…" while every engine stops, each
/// with its 15 seconds, then Halonic exits.
fn quit<R: Runtime>(app: &AppHandle<R>) {
    if app
        .state::<TrayShellState>()
        .quitting
        .swap(true, Ordering::SeqCst)
    {
        return;
    }
    let app = app.clone();
    // Off the main thread: redrawing the tray waits on it.
    thread::spawn(move || {
        refresh(&app);
        crate::engines::stop_all(&app);
        app.exit(0);
    });
}

/// Halonic is exiting (Quit, ⌘Q, an update): the tray isn't redrawn any
/// more, since a redraw waits on the main thread, which may be stopping the
/// engines.
pub fn stop_redrawing<R: Runtime>(app: &AppHandle<R>) {
    if let Some(state) = app.try_state::<TrayShellState>() {
        state.exiting.store(true, Ordering::SeqCst);
    }
}

/// A window asked to close: Studio's is hidden instead while Halonic keeps
/// running in the tray.
pub fn close_requested<R: Runtime>(window: &Window<R>, api: &CloseRequestApi) {
    let Some(state) = window.app_handle().try_state::<TrayShellState>() else {
        return;
    };
    let background = state.background.load(Ordering::SeqCst);
    let quitting = state.quitting.load(Ordering::SeqCst);
    if hides_on_close(window.label(), background, quitting) {
        api.prevent_close();
        if let Err(error) = window.hide() {
            halonic_shell_log::record("tray", format_args!("the window didn't hide: {error}"));
        }
    }
}

/// The app's events the tray answers: an exit asked after the last window
/// closed, and on macOS a click on the Dock icon while no window shows,
/// which brings Studio's window back.
pub fn run_event<R: Runtime>(app: &AppHandle<R>, event: &RunEvent) {
    match event {
        RunEvent::ExitRequested { code, api, .. } => exit_requested(app, *code, api),
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => crate::focused_apps::started_again(app, &[]),
        _ => {}
    }
}

/// Halonic was asked to exit with `code`: after the last window closed, it
/// keeps running in the tray.
fn exit_requested<R: Runtime>(app: &AppHandle<R>, code: Option<i32>, api: &ExitRequestApi) {
    let Some(state) = app.try_state::<TrayShellState>() else {
        return;
    };
    let windows_left = app.webview_windows().len();
    let background = state.background.load(Ordering::SeqCst);
    let quitting = state.quitting.load(Ordering::SeqCst);
    if stays_in_tray(code, windows_left, background, quitting) {
        api.prevent_exit();
    }
}

fn scheme() -> IconScheme {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").ok();
    IconScheme::for_desktop(std::env::consts::OS, desktop.as_deref())
}

/// The icon, 32 by 32 raw RGBA, drawn from Noah's sheet (`icons/README.md`).
fn icon(scheme: IconScheme, state: IconState) -> Image<'static> {
    Image::new(icon_bytes(scheme, state), 32, 32)
}

fn icon_bytes(scheme: IconScheme, state: IconState) -> &'static [u8] {
    match (scheme, state) {
        (IconScheme::Colour, IconState::Idle) => include_bytes!("../icons/tray/colour-idle.rgba"),
        (IconScheme::Colour, IconState::Running) => {
            include_bytes!("../icons/tray/colour-running.rgba")
        }
        (IconScheme::Colour, IconState::Paused) => {
            include_bytes!("../icons/tray/colour-paused.rgba")
        }
        (IconScheme::Colour, IconState::Problem) => {
            include_bytes!("../icons/tray/colour-problem.rgba")
        }
        (IconScheme::Template, IconState::Idle) => {
            include_bytes!("../icons/tray/template-idle.rgba")
        }
        (IconScheme::Template, IconState::Running) => {
            include_bytes!("../icons/tray/template-running.rgba")
        }
        (IconScheme::Template, IconState::Paused) => {
            include_bytes!("../icons/tray/template-paused.rgba")
        }
        (IconScheme::Template, IconState::Problem) => {
            include_bytes!("../icons/tray/template-problem.rgba")
        }
        (IconScheme::Symbolic, IconState::Idle) => {
            include_bytes!("../icons/tray/symbolic-idle.rgba")
        }
        (IconScheme::Symbolic, IconState::Running) => {
            include_bytes!("../icons/tray/symbolic-running.rgba")
        }
        (IconScheme::Symbolic, IconState::Paused) => {
            include_bytes!("../icons/tray/symbolic-paused.rgba")
        }
        (IconScheme::Symbolic, IconState::Problem) => {
            include_bytes!("../icons/tray/symbolic-problem.rgba")
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `studio.src-tauri.tray`: every scheme has all four states, each a
    /// 32 by 32 RGBA picture with something drawn.
    #[test]
    fn tray_every_icon_is_32_by_32_rgba() {
        let schemes = [
            IconScheme::Colour,
            IconScheme::Template,
            IconScheme::Symbolic,
        ];
        let states = [
            IconState::Idle,
            IconState::Running,
            IconState::Paused,
            IconState::Problem,
        ];
        for scheme in schemes {
            for state in states {
                let bytes = icon_bytes(scheme, state);
                assert_eq!(bytes.len(), 32 * 32 * 4, "{scheme:?} {state:?}");
                assert!(bytes.chunks(4).any(|pixel| pixel[3] > 0));
            }
        }
    }
}
