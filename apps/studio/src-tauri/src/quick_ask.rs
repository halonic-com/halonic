//! Quick ask's window and keys (HAL-18787; design HAL-18594, sections 4–5;
//! plan on HAL-18625). Ctrl+Alt+Space, or ⌥Space on macOS, opens the box
//! over whatever app has the focus: a frameless, always-on-top window on
//! the app's own page, labelled `ask`, at the top of the screen the pointer
//! is on. A second press, Esc (`plugin:quick-ask|hide`) or a click in
//! another app hides it. It is hidden, not closed, so the next press shows
//! it at once and the page keeps the text that wasn't sent.
//!
//! The keys are registered from Rust only, through the global-shortcut
//! plugin (`global_keys.rs`): no capability grants the plugin's commands,
//! so no page can register a key or hear one. Only Studio's window reads
//! and changes them, for Settings › Shortcuts (`plugin:quick-ask|shortcut`,
//! `plugin:quick-ask|shortcut_set`). The keys work while Halonic runs in
//! the tray, with Studio's window closed too. Where the keys can't work,
//! the tray's Ask… and `--app ask` still open the box.

use std::sync::{Mutex, MutexGuard, PoisonError};

use serde_json::Value;
use tauri::plugin::TauriPlugin;
use tauri::{
    AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, RunEvent, Runtime, Webview,
    WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::Shortcut;

use crate::focused_apps::FocusedApp;
use crate::global_keys::shortcuts;

#[path = "quick_ask_keys.rs"]
mod keys;
use keys::{
    Area, KeyState, KeyStatus, SHORTCUT_SETTING, box_closes_after, desktop_allows_keys, placement,
    saved_shortcut, shortcut_of,
};

/// Quick ask's keys and whether they work, once Studio has tried to
/// register them.
#[derive(Default)]
pub struct QuickAsk {
    keys: Mutex<Option<Keys>>,
}

#[derive(Clone, Copy)]
struct Keys {
    shortcut: Shortcut,
    state: KeyState,
}

/// The `quick-ask` plugin, whose commands build.rs names, so each needs its
/// capability. It registers the saved keys at start and closes the box
/// after the last other window, as the feedback plugin does for its keys.
pub fn commands<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("quick-ask")
        .invoke_handler(tauri::generate_handler![hide, shortcut, shortcut_set])
        .setup(|app, _api| {
            app.manage(QuickAsk::default());
            register_saved(app);
            Ok(())
        })
        .on_event(|app, event| {
            if let RunEvent::WindowEvent {
                label,
                event: WindowEvent::Destroyed,
                ..
            } = event
            {
                window_closed(app, label);
            }
        })
        .build()
}

fn keys_lock<R: Runtime>(app: &AppHandle<R>) -> MutexGuard<'_, Option<Keys>> {
    let state = app.state::<QuickAsk>().inner();
    state.keys.lock().unwrap_or_else(PoisonError::into_inner)
}

fn log(message: String) {
    halonic_shell_log::record("quick-ask", message);
}

/// Whether this desktop lets an app take a key for the whole screen.
fn keys_allowed_here() -> bool {
    desktop_allows_keys(
        std::env::consts::OS,
        std::env::var("XDG_SESSION_TYPE").ok().as_deref(),
        std::env::var_os("WAYLAND_DISPLAY").is_some(),
    )
}

/// Registers the saved keys, at start. It reads the profile, so it runs
/// off the UI thread. Keys another app holds are logged, and Studio runs
/// on with the tray's Ask…. Where no key can work, it reads nothing.
pub fn register_saved<R: Runtime>(app: &AppHandle<R>) {
    let unusable = if !keys_allowed_here() {
        Some(KeyState::Wayland)
    } else if shortcuts(app).is_none() {
        Some(KeyState::Unavailable)
    } else {
        None
    };
    if let Some(state) = unusable {
        let shortcut = saved_shortcut(None, std::env::consts::OS);
        *keys_lock(app) = Some(Keys { shortcut, state });
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let saved =
            crate::host_settings::saved_value(&app, SHORTCUT_SETTING).unwrap_or_else(|error| {
                log(format!("the saved keys can't be read: {error:?}"));
                None
            });
        let shortcut = saved_shortcut(saved.as_ref(), std::env::consts::OS);
        let mut keys = keys_lock(&app);
        let state = register(&app, shortcut);
        *keys = Some(Keys { shortcut, state });
    });
}

/// Registers `shortcut`, and says whether it works.
fn register<R: Runtime>(app: &AppHandle<R>, shortcut: Shortcut) -> KeyState {
    let Some(shortcuts) = shortcuts(app) else {
        return KeyState::Unavailable;
    };
    match shortcuts.register(shortcut) {
        Ok(()) => KeyState::On,
        Err(error) => {
            log(format!("the keys {shortcut} aren't registered: {error}"));
            KeyState::Taken
        }
    }
}

/// Whether `shortcut` is quick ask's, registered. A press while the keys
/// are being changed is nobody's, so the handler never waits on the change.
pub fn owns<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut) -> bool {
    app.try_state::<QuickAsk>().is_some_and(|state| {
        state.keys.try_lock().is_ok_and(|keys| {
            keys.is_some_and(|keys| keys.state == KeyState::On && keys.shortcut == *shortcut)
        })
    })
}

/// A press of the keys: hides the box when it shows with the focus,
/// otherwise shows it.
pub fn pressed<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(FocusedApp::Ask.name())
        && window.is_visible().unwrap_or(false)
        && window.is_focused().unwrap_or(false)
    {
        hide_window(&window);
        return;
    }
    if let Err(error) = show(app) {
        log(format!("the box didn't open: {error}"));
    }
}

/// Shows the box on the screen the pointer is on, with the focus, opening
/// its window the first time.
pub fn show<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let window = match app.get_webview_window(FocusedApp::Ask.name()) {
        Some(window) => window,
        None => open(app)?,
    };
    place(&window)?;
    window.show()?;
    window.set_focus()
}

/// Opens the box's window, hidden. It hides when another app takes the
/// focus: that is the click outside the box.
fn open<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    let window = crate::window::open_ask(app)?;
    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Focused(false))
            && let Some(window) = handle.get_webview_window(FocusedApp::Ask.name())
        {
            hide_window(&window);
        }
    });
    Ok(window)
}

/// Moves the box's window onto the active screen; where no screen is
/// known, it is centred.
fn place<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let Some(screen) = active_screen(window) else {
        return window.center();
    };
    let spot = placement(
        Area {
            left: screen.position().x,
            top: screen.position().y,
            width: screen.size().width,
            height: screen.size().height,
        },
        screen.scale_factor(),
    );
    window.set_position(PhysicalPosition::new(spot.left, spot.top))?;
    window.set_size(PhysicalSize::new(spot.width, spot.height))
}

/// The screen the pointer is on, else the main screen. Asked through the
/// box's window, which knows every screen.
fn active_screen<R: Runtime>(window: &WebviewWindow<R>) -> Option<Monitor> {
    let pointer = window.cursor_position().ok();
    pointer
        .and_then(|pointer| {
            window
                .monitor_from_point(pointer.x, pointer.y)
                .ok()
                .flatten()
        })
        .or_else(|| window.primary_monitor().ok().flatten())
}

fn hide_window<R: Runtime>(window: &WebviewWindow<R>) {
    if let Err(error) = window.hide() {
        log(format!("the box didn't hide: {error}"));
    }
}

/// Closes the box's window once every other window has closed while
/// Halonic doesn't keep running in the tray, so a hidden box never keeps
/// Halonic running with nothing showing. `closed` is the window that just
/// closed.
pub fn window_closed<R: Runtime>(app: &AppHandle<R>, closed: &str) {
    let open = app.webview_windows();
    let in_tray = crate::tray::keeps_running(app);
    if !box_closes_after(closed, open.keys().map(String::as_str), in_tray) {
        return;
    }
    if let Some(window) = open.get(FocusedApp::Ask.name())
        && let Err(error) = window.close()
    {
        log(format!("the box didn't close: {error}"));
    }
}

/// Hides the box: Esc, or a click beside it on its own page. Refused as
/// `not_the_box` from any other window.
#[tauri::command]
fn hide<R: Runtime>(webview: Webview<R>) -> Result<(), &'static str> {
    if webview.label() != FocusedApp::Ask.name() {
        return Err("not_the_box");
    }
    webview.window().hide().map_err(|_| "failed")
}

/// Quick ask's keys and whether they work, for Settings › Shortcuts. Async,
/// so it waits for a registration off the main thread, which the
/// registration itself needs.
#[tauri::command]
async fn shortcut<R: Runtime>(app: AppHandle<R>) -> KeyStatus {
    let keys = *keys_lock(&app);
    let Keys { shortcut, state } = keys.unwrap_or_else(|| Keys {
        shortcut: saved_shortcut(None, std::env::consts::OS),
        state: KeyState::Unavailable,
    });
    KeyStatus {
        shortcut: shortcut.into_string(),
        state,
    }
}

/// Saves `shortcut` as quick ask's keys. Refused as `invalid` when it isn't
/// a shortcut or holds none of Ctrl, Alt and Super (⌘), `wayland` where the desktop lets no app take a key,
/// `unavailable` where Studio hears no keys, and `taken` when the system
/// or another app holds the keys.
#[tauri::command]
async fn shortcut_set<R: Runtime>(app: AppHandle<R>, shortcut: String) -> Result<(), &'static str> {
    let new = shortcut_of(&shortcut).ok_or("invalid")?;
    if !keys_allowed_here() {
        return Err("wayland");
    }
    register_instead(&app, new)?;
    let value = Value::String(new.into_string());
    tauri::async_runtime::spawn_blocking(move || {
        crate::host_settings::save(&app, SHORTCUT_SETTING, Some(&value))
    })
    .await
    .map_err(|_| "failed")?
    .map_err(|_| "failed")
}

/// Registers `new` before it lets go of the old keys, so a refused change
/// leaves the old keys working.
fn register_instead<R: Runtime>(app: &AppHandle<R>, new: Shortcut) -> Result<(), &'static str> {
    let shortcuts = shortcuts(app).ok_or("unavailable")?;
    let mut keys = keys_lock(app);
    let registered = keys.filter(|keys| keys.state == KeyState::On);
    if registered.is_some_and(|keys| keys.shortcut == new) {
        return Ok(());
    }
    shortcuts.register(new).map_err(|_| "taken")?;
    *keys = Some(Keys {
        shortcut: new,
        state: KeyState::On,
    });
    if let Some(old) = registered
        && let Err(error) = shortcuts.unregister(old.shortcut)
    {
        log(format!(
            "the old keys {} stay registered: {error}",
            old.shortcut
        ));
    }
    Ok(())
}

#[cfg(test)]
#[path = "quick_ask_tests.rs"]
mod tests;
