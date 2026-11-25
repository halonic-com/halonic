//! The app window. Tauri opens configured windows without a title handler
//! and doesn't copy `document.title` into the native title, so the task bar
//! and the window switcher would keep showing "Halonic". The shell opens
//! the window itself, from the same configuration (`create` is off in
//! tauri.conf.json), and the native title follows the page's title. A
//! focused app's window (`focused_apps`) is opened from it too.

use tauri::utils::config::WindowConfig;
use tauri::webview::{WebviewWindow, WebviewWindowBuilder};
use tauri::{Manager, Runtime};

#[cfg(desktop)]
use crate::focused_apps::FocusedApp;

/// Opens the window tauri.conf.json describes, with its native title
/// following the page's title.
pub fn open<R: Runtime, M: Manager<R>>(manager: &M) -> tauri::Result<WebviewWindow<R>> {
    open_from(manager, app_window_config(manager))
}

#[cfg(desktop)]
/// Opens `app`'s own window (HAL-17903): the same page as Studio's, under
/// the app's label, title and icon, and on Windows with its own taskbar
/// entry.
pub fn open_focused<R: Runtime, M: Manager<R>>(
    manager: &M,
    app: FocusedApp,
) -> tauri::Result<WebviewWindow<R>> {
    let mut config = app_window_config(manager);
    config.label = app.name().to_owned();
    config.title = app.title().to_owned();
    // Shown once it has its taskbar ID, so the taskbar never shows it in
    // Halonic's own entry first.
    config.visible = false;
    let window = open_from(manager, config)?;
    // Without its own icon the window still works, with Studio's.
    if let Err(error) = window.set_icon(app.icon()) {
        halonic_shell_log::record(
            "window",
            format!("{}'s icon didn't set: {error}", app.title()),
        );
    }
    #[cfg(windows)]
    {
        let app_id = app.app_user_model_id(&manager.config().identifier);
        // Without its own ID the window still works, in Halonic's entry.
        if let Err(error) = halonic_window_app_id::set(window.hwnd()?.0, &app_id) {
            halonic_shell_log::record("window", error);
        }
    }
    window.show()?;
    Ok(window)
}

/// The app window tauri.conf.json describes.
pub(crate) fn app_window_config<R: Runtime, M: Manager<R>>(manager: &M) -> WindowConfig {
    manager
        .config()
        .app
        .windows
        .first()
        .cloned()
        .expect("tauri.conf.json describes the app window")
}

fn open_from<R: Runtime, M: Manager<R>>(
    manager: &M,
    config: WindowConfig,
) -> tauri::Result<WebviewWindow<R>> {
    let app_title = config.title.clone();
    WebviewWindowBuilder::from_config(manager, &config)?
        .on_document_title_changed(move |window, page_title| {
            // A title the system refuses leaves the last one in place.
            let _ = window.set_title(native_title(&page_title, &app_title));
        })
        .build()
}

/// The native title for a page titled `page_title`: the page's title, or
/// `app_title` while the page has none.
fn native_title<'a>(page_title: &'a str, app_title: &'a str) -> &'a str {
    let page_title = page_title.trim();
    if page_title.is_empty() {
        app_title
    } else {
        page_title
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_title_is_the_page_title() {
        assert_eq!(
            native_title("Inbox · Acme · Halonic", "Halonic"),
            "Inbox · Acme · Halonic"
        );
    }

    #[test]
    fn native_title_is_the_app_while_the_page_has_no_title() {
        assert_eq!(native_title("", "Halonic"), "Halonic");
        assert_eq!(native_title("  ", "Halonic"), "Halonic");
    }

    #[test]
    fn opens_the_configured_window() {
        let app = crate::shell(tauri::test::mock_builder())
            .build(tauri::generate_context!())
            .expect("the shell builds on the mock runtime");
        let window = open(&app).expect("the app window opens");
        assert_eq!(window.label(), "main");
    }

    #[cfg(desktop)]
    #[test]
    fn opens_a_focused_app_under_its_own_label() {
        let app = crate::shell(tauri::test::mock_builder())
            .build(tauri::generate_context!())
            .expect("the shell builds on the mock runtime");
        let window = open_focused(&app, FocusedApp::Messenger).expect("the Messenger opens");
        assert_eq!(window.label(), "messenger");
    }
}
