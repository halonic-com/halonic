//! The app window. Tauri opens configured windows without a title handler
//! and doesn't copy `document.title` into the native title, so the task bar
//! and the window switcher would keep showing "Halonic". The shell opens
//! the window itself, from the same configuration (`create` is off in
//! tauri.conf.json), and the native title follows the page's title.

use tauri::webview::{WebviewWindow, WebviewWindowBuilder};
use tauri::{Manager, Runtime};

/// Opens the window tauri.conf.json describes, with its native title
/// following the page's title.
pub fn open<R: Runtime, M: Manager<R>>(manager: &M) -> tauri::Result<WebviewWindow<R>> {
    let config = manager
        .config()
        .app
        .windows
        .first()
        .cloned()
        .expect("tauri.conf.json describes the app window");
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
}
