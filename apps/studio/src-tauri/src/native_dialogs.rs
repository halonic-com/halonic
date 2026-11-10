//! The shell's two native dialogs: the folder picker and the trust question
//! (HAL-2612). They are shown with `rfd`, the library `tauri-plugin-dialog`
//! uses, called from Rust only: registering the plugin would put its script
//! in every page, the served Studio too, replacing `alert` and `confirm`.
//!
//! Both block, so they are called from a worker thread, never the UI's.
//! Android and iOS have neither dialog: the picker picks nothing and the
//! question is answered no.

use std::path::PathBuf;

use tauri::{AppHandle, Runtime};

#[cfg(desktop)]
use halonic_trust_grant::{CANCEL_BUTTON, QUESTION_TITLE, TRUST_BUTTON};

/// Shows the folder picker; `None` when the person cancels it.
#[cfg(desktop)]
pub fn pick_folder<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let picked = show_and_wait(app, || rfd::AsyncFileDialog::new().pick_folder())?;
    picked.map(|folder| folder.path().to_owned())
}

/// Shows the trust question; `true` only when the person presses Trust.
/// Closing the dialog or pressing Escape answers Cancel.
#[cfg(desktop)]
pub fn ask_to_trust<R: Runtime>(app: &AppHandle<R>, question: &str) -> bool {
    use rfd::{AsyncMessageDialog, MessageButtons, MessageDialogResult, MessageLevel};

    let question = question.to_owned();
    let answer = show_and_wait(app, move || {
        AsyncMessageDialog::new()
            .set_level(MessageLevel::Warning)
            .set_title(QUESTION_TITLE)
            .set_description(question)
            .set_buttons(MessageButtons::OkCancelCustom(
                TRUST_BUTTON.to_owned(),
                CANCEL_BUTTON.to_owned(),
            ))
            .show()
    });
    // On Linux, rfd answers a custom first button as `Ok`, not by its label.
    match answer {
        Some(MessageDialogResult::Custom(label)) => label == TRUST_BUTTON,
        Some(MessageDialogResult::Ok) => true,
        _ => false,
    }
}

/// Makes the dialog on the main thread, as macOS and GTK require, and
/// waits on this thread for the person's answer. `None` when the main
/// thread no longer runs, as when the app is closing.
#[cfg(desktop)]
fn show_and_wait<R, D, F>(app: &AppHandle<R>, dialog: D) -> Option<F::Output>
where
    R: Runtime,
    D: FnOnce() -> F + Send + 'static,
    F: std::future::Future + Send + 'static,
    F::Output: Send + 'static,
{
    let (answer, answered) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let shown = dialog();
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

#[cfg(mobile)]
pub fn pick_folder<R: Runtime>(_app: &AppHandle<R>) -> Option<PathBuf> {
    None
}

#[cfg(mobile)]
pub fn ask_to_trust<R: Runtime>(_app: &AppHandle<R>, _question: &str) -> bool {
    false
}
