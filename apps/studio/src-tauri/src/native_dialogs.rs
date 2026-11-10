//! The shell's two native dialogs: the folder picker and the trust question
//! (HAL-2612). They are shown with `rfd`, the library `tauri-plugin-dialog`
//! uses, called from Rust only: registering the plugin would put its script
//! in every page, the served Studio too, replacing `alert` and `confirm`.
//!
//! Both block, so they are called from a worker thread, never the UI's.
//! Both belong to the shell's window, so they can't open behind it: on
//! Windows the window waits for the answer, on macOS the dialog is a sheet
//! on it. rfd's GTK dialogs take no parent, so on Linux nothing changes.
//! Android and iOS have neither dialog: the picker picks nothing and the
//! question is answered no.

use std::path::PathBuf;

use tauri::{AppHandle, Runtime};

#[cfg(desktop)]
use tauri::{Manager, WebviewWindow};

#[cfg(desktop)]
use halonic_trust_grant::{CANCEL_BUTTON, QUESTION_TITLE, TRUST_BUTTON};

/// The label of the shell's only window. tauri.conf.json gives the window
/// no label, so Tauri names it `main`, as the capabilities do.
#[cfg(desktop)]
const SHELL_WINDOW: &str = "main";

/// Shows the folder picker; `None` when the person cancels it.
#[cfg(desktop)]
pub fn pick_folder<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let picked = show_and_wait(app, |parent| {
        let dialog = rfd::AsyncFileDialog::new();
        match parent {
            Some(window) => dialog.set_parent(window),
            None => dialog,
        }
        .pick_folder()
    })?;
    picked.map(|folder| folder.path().to_owned())
}

/// Shows the trust question; `true` only when the person presses Trust.
/// Closing the dialog or pressing Escape answers Cancel.
#[cfg(desktop)]
pub fn ask_to_trust<R: Runtime>(app: &AppHandle<R>, question: &str) -> bool {
    use rfd::{AsyncMessageDialog, MessageButtons, MessageDialogResult, MessageLevel};

    let question = question.to_owned();
    let answer = show_and_wait(app, move |parent| {
        let dialog = AsyncMessageDialog::new()
            .set_level(MessageLevel::Warning)
            .set_title(QUESTION_TITLE)
            .set_description(question)
            .set_buttons(MessageButtons::OkCancelCustom(
                TRUST_BUTTON.to_owned(),
                CANCEL_BUTTON.to_owned(),
            ));
        match parent {
            Some(window) => dialog.set_parent(window),
            None => dialog,
        }
        .show()
    });
    // On Linux, rfd answers a custom first button as `Ok`, not by its label.
    match answer {
        Some(MessageDialogResult::Custom(label)) => label == TRUST_BUTTON,
        Some(MessageDialogResult::Ok) => true,
        _ => false,
    }
}

/// Makes the dialog on the main thread, as macOS and GTK require, with the
/// shell's window as its parent, and waits on this thread for the person's
/// answer. The parent is `None` once the window is closed; the dialog then
/// opens on its own. `None` when the main thread no longer runs, as when
/// the app is closing.
#[cfg(desktop)]
fn show_and_wait<R, D, F>(app: &AppHandle<R>, dialog: D) -> Option<F::Output>
where
    R: Runtime,
    D: FnOnce(Option<&WebviewWindow<R>>) -> F + Send + 'static,
    F: std::future::Future + Send + 'static,
    F::Output: Send + 'static,
{
    let (answer, answered) = std::sync::mpsc::channel();
    let shell = app.clone();
    app.run_on_main_thread(move || {
        // macOS hands out the window's handle only on the main thread.
        let shown = dialog(shell_window(&shell).as_ref());
        // The answer is awaited off the main thread, which must keep
        // running for the dialog to work.
        std::thread::spawn(move || {
            // The receiver is gone only if the waiting call was dropped.
            let _ = answer.send(tauri::async_runtime::block_on(shown));
        });
    })
    .ok()?;
    answered.recv().ok()
}

/// The shell's window, the dialogs' parent; `None` once it is closed.
#[cfg(desktop)]
fn shell_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window(SHELL_WINDOW)
}

#[cfg(mobile)]
pub fn pick_folder<R: Runtime>(_app: &AppHandle<R>) -> Option<PathBuf> {
    None
}

#[cfg(mobile)]
pub fn ask_to_trust<R: Runtime>(_app: &AppHandle<R>, _question: &str) -> bool {
    false
}

#[cfg(all(test, desktop))]
mod tests {
    use tauri::test::{MockRuntime, mock_builder};
    use tauri::webview::WebviewWindowBuilder;
    use tauri::{App, WebviewUrl};

    use super::{SHELL_WINDOW, shell_window};

    fn shell_app() -> App<MockRuntime> {
        crate::shell(mock_builder())
            .build(tauri::generate_context!())
            .expect("the shell builds on the mock runtime")
    }

    #[test]
    fn the_parent_is_the_window_tauri_conf_opens() {
        let app = shell_app();
        let windows = &app.config().app.windows;
        assert_eq!(windows.len(), 1, "the shell opens one window");
        assert_eq!(windows[0].label, SHELL_WINDOW);
    }

    #[test]
    fn the_dialogs_get_the_shells_window_as_parent() {
        let app = shell_app();
        // The mock opens configured windows only when the app runs, so the
        // test opens it under the configured label.
        let label = app.config().app.windows[0].label.clone();
        WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::default())
            .build()
            .expect("the shell's window opens");
        let parent = shell_window(app.handle()).expect("the shell's window is the parent");
        assert_eq!(parent.label(), label);
    }

    #[test]
    fn the_dialogs_open_without_parent_once_the_window_is_gone() {
        let app = shell_app();
        assert!(shell_window(app.handle()).is_none());
    }
}
