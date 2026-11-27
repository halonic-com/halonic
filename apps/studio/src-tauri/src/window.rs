//! The app window. Tauri opens configured windows without a title handler
//! and doesn't copy `document.title` into the native title, so the task bar
//! and the window switcher would keep showing "Halonic". The shell opens
//! the window itself, from the same configuration (`create` is off in
//! tauri.conf.json), and the native title follows the page's title. A
//! focused app's window (`focused_apps`) is opened from it too. On the
//! desktop each opens hidden and shows once it is back in its kept place
//! (`window_place`).

use tauri::utils::config::WindowConfig;
use tauri::webview::{WebviewWindow, WebviewWindowBuilder};
use tauri::{Manager, Runtime};

#[cfg(desktop)]
use crate::focused_apps::FocusedApp;

/// Opens the window tauri.conf.json describes, with its native title
/// following the page's title.
#[cfg(mobile)]
pub fn open<R: Runtime, M: Manager<R>>(manager: &M) -> tauri::Result<WebviewWindow<R>> {
    open_from(manager, app_window_config(manager))
}

/// Opens the window tauri.conf.json describes, with its native title
/// following the page's title, in its kept place.
#[cfg(desktop)]
pub fn open<R: Runtime, M: Manager<R>>(manager: &M) -> tauri::Result<WebviewWindow<R>> {
    let mut config = app_window_config(manager);
    // Shown once it is in its kept place, so it never shows elsewhere first.
    config.visible = false;
    let window = open_from(manager, config)?;
    crate::window_place::restore(&window);
    window.show()?;
    Ok(window)
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
    #[cfg(not(windows))]
    if let Some(icon) = app.icon()
        && let Err(error) = window.set_icon(icon)
    {
        halonic_shell_log::record(
            "window",
            format!("{}'s icon didn't set: {error}", app.title()),
        );
    }
    // Windows takes both of the window's icons from the app's .ico.
    #[cfg(windows)]
    crate::window_icons::set(&window, app);
    #[cfg(windows)]
    {
        let app_id = app.app_user_model_id(&manager.config().identifier);
        // Without its own ID the window still works, in Halonic's entry.
        if let Err(error) = halonic_window_app_id::set(window.hwnd()?.0, &app_id) {
            halonic_shell_log::record("window", error);
        }
    }
    crate::window_place::restore(&window);
    window.show()?;
    Ok(window)
}

/// Opens `app`'s window inside its frame `frame` (HAL-20468,
/// `app_frames`): the same page and label, as a child window that fills
/// the frame's inside. The frame has the title bar, icons, taskbar ID and
/// place, so the window has none of its own; the page's title goes to the
/// frame.
#[cfg(windows)]
pub fn open_in_frame<R: Runtime, M: Manager<R>>(
    manager: &M,
    app: FocusedApp,
    frame: isize,
) -> tauri::Result<WebviewWindow<R>> {
    let mut config = app_window_config(manager);
    config.label = app.name().to_owned();
    config.title = app.title().to_owned();
    config.decorations = false;
    config.shadow = false;
    let parent = windows::Win32::Foundation::HWND(frame as *mut core::ffi::c_void);
    let window = builder_from(manager, config)?.parent_raw(parent).build()?;
    if let Some((width, height)) = halonic_app_frame::client_size(frame) {
        window.set_position(tauri::PhysicalPosition::new(0, 0))?;
        window.set_size(tauri::PhysicalSize::new(width, height))?;
    }
    Ok(window)
}

#[cfg(desktop)]
/// Opens quick ask's window (HAL-18787), hidden, on the same page as
/// Studio's: frameless and transparent, so the page draws the box with its
/// own corners and shadow (design HAL-18594, "For the build"), always on
/// top, on every desktop space and without a taskbar entry or a system
/// shadow of its own. `quick_ask` places and shows it.
pub fn open_ask<R: Runtime, M: Manager<R>>(manager: &M) -> tauri::Result<WebviewWindow<R>> {
    let mut config = app_window_config(manager);
    config.label = FocusedApp::Ask.name().to_owned();
    config.title = FocusedApp::Ask.title().to_owned();
    config.visible = false;
    config.decorations = false;
    config.transparent = true;
    config.shadow = false;
    config.always_on_top = true;
    config.visible_on_all_workspaces = true;
    config.skip_taskbar = true;
    config.resizable = false;
    WebviewWindowBuilder::from_config(manager, &config)?.build()
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
    builder_from(manager, config)?.build()
}

/// The builder for the window `config` describes, its native title (and
/// on Windows its frame's, when it sits in one) following the page's title.
fn builder_from<'a, R: Runtime, M: Manager<R>>(
    manager: &'a M,
    config: WindowConfig,
) -> tauri::Result<WebviewWindowBuilder<'a, R, M>> {
    let app_title = config.title.clone();
    Ok(
        WebviewWindowBuilder::from_config(manager, &config)?.on_document_title_changed(
            move |window, page_title| {
                let title = native_title(&page_title, &app_title);
                // A title the system refuses leaves the last one in place.
                let _ = window.set_title(title);
                #[cfg(windows)]
                crate::app_frames::set_frame_title(&window, title);
            },
        ),
    )
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
