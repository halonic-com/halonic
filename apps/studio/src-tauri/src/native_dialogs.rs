//! The shell's native dialogs: the folder picker, the save dialog for the
//! sandbox backup (HAL-10974) and for a file a run created (HAL-17832), the two trust
//! questions, about a folder (HAL-2612) and about an agent's instructions,
//! the question before Studio runs agents without a sandbox (HAL-16342), and
//! the one before it saves the yes to run plugins and integrations without
//! the sandbox (HAL-16466), and the three before Settings › Remote turns
//! remote on, lets phones answer risky approvals or allows a phone to pair
//! (HAL-17795), and the confirmation before a stepper's `admin` step is
//! sent (HAL-18084).
//! They are shown with `rfd`, the library `tauri-plugin-dialog` uses, called
//! from Rust only: registering the plugin would put its script in every
//! page, the served Studio too, replacing `alert` and `confirm`.
//!
//! Both block, so they are called from a worker thread, never the UI's.
//! Both belong to the shell's window, so they can't open behind it: on
//! Windows the window waits for the answer, on macOS the dialog is a sheet
//! on it. rfd's GTK dialogs take no parent, so on Linux nothing changes.
//! Android and iOS have none of these dialogs: the picker picks nothing and
//! the questions are answered no.

use std::path::PathBuf;

use tauri::{AppHandle, Runtime};

#[cfg(desktop)]
use tauri::{Manager, WebviewWindow};

#[cfg(desktop)]
use halonic_trust_grant::{
    CANCEL_BUTTON, INSTRUCTIONS_QUESTION_TITLE, QUESTION_TITLE, TRUST_BUTTON,
};

/// The title of the question before the choice `none` is saved; the page's
/// own question has the same title.
#[cfg(desktop)]
const NO_SANDBOX_TITLE: &str = "Continue without a sandbox?";

/// The question's text. It says the shell asks again on purpose, so a
/// person who didn't just choose this in Studio sees it isn't theirs.
#[cfg(desktop)]
const NO_SANDBOX_QUESTION: &str = "Halonic is about to run agents without a sandbox. \
Agents then run commands as you, and could look at things outside your project, such as your SSH keys.\n\n\
Continue only if you just chose this in Halonic.";

/// The button that saves the choice `none`, as the page's own button says.
#[cfg(desktop)]
const NO_SANDBOX_BUTTON: &str = "Continue without sandbox";

/// The title of the question before the yes to run plugins and integrations
/// without the sandbox is saved; the page's own Allow dialog has the same
/// title.
#[cfg(desktop)]
const UNFENCED_ALLOW_TITLE: &str = "Allow plugins and integrations to run without the sandbox?";

/// The question's text. As [`NO_SANDBOX_QUESTION`], it says the shell asks
/// again on purpose.
#[cfg(desktop)]
const UNFENCED_ALLOW_QUESTION: &str = "Halonic is about to save your yes to run plugins and \
integrations without the sandbox on this computer. They then run commands as you, and could look \
at things outside your project, such as your SSH keys.\n\n\
Allow only if you just chose this in Halonic.";

/// The button that saves the yes, as the page's own button says.
#[cfg(desktop)]
const UNFENCED_ALLOW_BUTTON: &str = "Allow";

/// The title of the question before remote is turned on; the page's switch
/// has the same name.
#[cfg(desktop)]
const REMOTE_ON_TITLE: &str = "Let phones reach this computer?";

/// The question's text. As [`NO_SANDBOX_QUESTION`], it says the shell asks
/// again on purpose.
#[cfg(desktop)]
const REMOTE_ON_QUESTION: &str = "Halonic is about to let paired phones reach this computer. \
A paired phone can view your agents, approve and send prompts.\n\n\
Turn on only if you just chose this in Halonic.";

/// The button that turns remote on.
#[cfg(desktop)]
const REMOTE_ON_BUTTON: &str = "Turn on";

/// The title of the question before phones may answer risky approvals; the
/// page's switch has the same name.
#[cfg(desktop)]
const RISKY_REMOTE_TITLE: &str = "Let phones answer risky approvals?";

/// The question's text, with what risky means, as the page's switch says it.
#[cfg(desktop)]
const RISKY_REMOTE_QUESTION: &str = "Halonic is about to let paired phones answer risky \
approvals: a shell command, a file change, a secret or leaving the sandbox. A phone's yes then \
counts as yours.\n\n\
Allow only if you just chose this in Halonic.";

/// The title of the question before a phone is allowed to pair.
#[cfg(desktop)]
const PAIRING_TITLE: &str = "Pair this phone?";

/// The question's text. It points at the check code, the page's own check.
#[cfg(desktop)]
const PAIRING_QUESTION: &str = "Halonic is about to pair a new phone with this computer. \
It can then view your agents, approve and send prompts until you revoke it.\n\n\
Allow only if you just pressed Allow in Halonic and your phone shows the same code.";

/// The button that saves the yes, the risky approvals or the pairing, as
/// the page's own button says.
#[cfg(desktop)]
const REMOTE_ALLOW_BUTTON: &str = "Allow";

/// The title of the confirmation before a stepper's `admin` step is sent.
#[cfg(desktop)]
const SEND_STEP_TITLE: &str = "Send this request?";

/// The button that sends the step.
#[cfg(desktop)]
const SEND_STEP_BUTTON: &str = "Send";

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

/// Shows the save dialog for a backup file named `suggested`; `None` when
/// the person cancels it.
#[cfg(desktop)]
pub fn pick_backup_file<R: Runtime>(app: &AppHandle<R>, suggested: &str) -> Option<PathBuf> {
    let suggested = suggested.to_owned();
    let picked = show_and_wait(app, move |parent| {
        let dialog = rfd::AsyncFileDialog::new()
            .set_file_name(suggested)
            .add_filter("Backup", &["tar"]);
        match parent {
            Some(window) => dialog.set_parent(window),
            None => dialog,
        }
        .save_file()
    })?;
    picked.map(|file| file.path().to_owned())
}

/// Shows the save dialog for a file a run created, named `suggested`
/// (HAL-17832); `None` when the person cancels it. The dialog asks before
/// it replaces a file that is there.
#[cfg(desktop)]
pub fn pick_save_file<R: Runtime>(app: &AppHandle<R>, suggested: &str) -> Option<PathBuf> {
    let suggested = suggested.to_owned();
    let picked = show_and_wait(app, move |parent| {
        let dialog = rfd::AsyncFileDialog::new().set_file_name(suggested);
        match parent {
            Some(window) => dialog.set_parent(window),
            None => dialog,
        }
        .save_file()
    })?;
    picked.map(|file| file.path().to_owned())
}

/// Shows the trust question about a folder; `true` only when the person
/// presses Trust. Closing the dialog or pressing Escape answers Cancel.
#[cfg(desktop)]
pub fn ask_to_trust<R: Runtime>(app: &AppHandle<R>, question: &str) -> bool {
    ask(app, QUESTION_TITLE, question, TRUST_BUTTON)
}

/// Shows the trust question about an agent's instructions, answered as
/// [`ask_to_trust`] answers.
#[cfg(desktop)]
pub fn ask_to_trust_instructions<R: Runtime>(app: &AppHandle<R>, question: &str) -> bool {
    ask(app, INSTRUCTIONS_QUESTION_TITLE, question, TRUST_BUTTON)
}

/// Shows the question before the choice `none` is saved; `true` only when
/// the person presses Continue without sandbox, answered as [`ask_to_trust`]
/// answers.
#[cfg(desktop)]
pub fn ask_to_continue_without_sandbox<R: Runtime>(app: &AppHandle<R>) -> bool {
    ask(
        app,
        NO_SANDBOX_TITLE,
        NO_SANDBOX_QUESTION,
        NO_SANDBOX_BUTTON,
    )
}

/// Shows the question before the yes to run plugins and integrations without
/// the sandbox is saved; `true` only when the person presses Allow, answered
/// as [`ask_to_trust`] answers.
#[cfg(desktop)]
pub fn ask_to_allow_without_sandbox<R: Runtime>(app: &AppHandle<R>) -> bool {
    ask(
        app,
        UNFENCED_ALLOW_TITLE,
        UNFENCED_ALLOW_QUESTION,
        UNFENCED_ALLOW_BUTTON,
    )
}

/// Shows the question before remote is turned on; `true` only when the
/// person presses Turn on, answered as [`ask_to_trust`] answers.
#[cfg(desktop)]
pub fn ask_to_turn_remote_on<R: Runtime>(app: &AppHandle<R>) -> bool {
    ask(app, REMOTE_ON_TITLE, REMOTE_ON_QUESTION, REMOTE_ON_BUTTON)
}

/// Shows the question before phones may answer risky approvals; `true` only
/// when the person presses Allow, answered as [`ask_to_trust`] answers.
#[cfg(desktop)]
pub fn ask_to_allow_risky_remotely<R: Runtime>(app: &AppHandle<R>) -> bool {
    ask(
        app,
        RISKY_REMOTE_TITLE,
        RISKY_REMOTE_QUESTION,
        REMOTE_ALLOW_BUTTON,
    )
}

/// Shows the question before a phone is allowed to pair; `true` only when
/// the person presses Allow, answered as [`ask_to_trust`] answers.
#[cfg(desktop)]
pub fn ask_to_allow_pairing<R: Runtime>(app: &AppHandle<R>) -> bool {
    ask(app, PAIRING_TITLE, PAIRING_QUESTION, REMOTE_ALLOW_BUTTON)
}

/// Shows the confirmation before a stepper's `admin` step is sent, with
/// the request the shell built; `true` only when the person presses Send,
/// answered as [`ask_to_trust`] answers.
#[cfg(desktop)]
pub fn ask_to_send_step<R: Runtime>(app: &AppHandle<R>, question: &str) -> bool {
    ask(app, SEND_STEP_TITLE, question, SEND_STEP_BUTTON)
}

/// Shows a warning with `yes` and Cancel; `true` only for `yes`.
#[cfg(desktop)]
fn ask<R: Runtime>(
    app: &AppHandle<R>,
    title: &'static str,
    question: &str,
    yes: &'static str,
) -> bool {
    use rfd::{AsyncMessageDialog, MessageButtons, MessageDialogResult, MessageLevel};

    let question = question.to_owned();
    let answer = show_and_wait(app, move |parent| {
        let dialog = AsyncMessageDialog::new()
            .set_level(MessageLevel::Warning)
            .set_title(title)
            .set_description(question)
            .set_buttons(MessageButtons::OkCancelCustom(
                yes.to_owned(),
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
        Some(MessageDialogResult::Custom(label)) => label == yes,
        Some(MessageDialogResult::Ok) => true,
        _ => false,
    }
}

/// Makes the dialog on the main thread, as macOS and GTK require, with
/// [`dialog_parent`] as its parent, and waits on this thread for the
/// person's answer. The parent is `None` once every window is closed; the
/// dialog then opens on its own. `None` when the main thread no longer runs, as when
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
        let shown = dialog(dialog_parent(&shell).as_ref());
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

/// The dialogs' parent: the shell's window that has the keyboard focus, as
/// the one the person just used to ask; otherwise Studio's window, or
/// whichever app window is open (HAL-17915). `None` once every window is
/// closed.
#[cfg(desktop)]
pub(crate) fn dialog_parent<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    let open: Vec<WebviewWindow<R>> = crate::focused_apps::window_labels()
        .iter()
        .filter_map(|label| app.get_webview_window(label))
        .collect();
    let focused = open
        .iter()
        .position(|window| window.is_focused().unwrap_or(false))
        .unwrap_or(0);
    open.into_iter().nth(focused)
}

#[cfg(mobile)]
pub fn pick_folder<R: Runtime>(_app: &AppHandle<R>) -> Option<PathBuf> {
    None
}

#[cfg(mobile)]
pub fn pick_backup_file<R: Runtime>(_app: &AppHandle<R>, _suggested: &str) -> Option<PathBuf> {
    None
}

#[cfg(mobile)]
pub fn pick_save_file<R: Runtime>(_app: &AppHandle<R>, _suggested: &str) -> Option<PathBuf> {
    None
}

#[cfg(mobile)]
pub fn ask_to_trust<R: Runtime>(_app: &AppHandle<R>, _question: &str) -> bool {
    false
}

#[cfg(mobile)]
pub fn ask_to_trust_instructions<R: Runtime>(_app: &AppHandle<R>, _question: &str) -> bool {
    false
}

#[cfg(mobile)]
pub fn ask_to_continue_without_sandbox<R: Runtime>(_app: &AppHandle<R>) -> bool {
    false
}

#[cfg(mobile)]
pub fn ask_to_allow_without_sandbox<R: Runtime>(_app: &AppHandle<R>) -> bool {
    false
}

#[cfg(mobile)]
pub fn ask_to_turn_remote_on<R: Runtime>(_app: &AppHandle<R>) -> bool {
    false
}

#[cfg(mobile)]
pub fn ask_to_allow_risky_remotely<R: Runtime>(_app: &AppHandle<R>) -> bool {
    false
}

#[cfg(mobile)]
pub fn ask_to_allow_pairing<R: Runtime>(_app: &AppHandle<R>) -> bool {
    false
}

#[cfg(all(test, desktop))]
mod tests {
    use tauri::test::{MockRuntime, mock_builder};
    use tauri::webview::WebviewWindowBuilder;
    use tauri::{App, WebviewUrl};

    use super::dialog_parent;
    use crate::focused_apps::{FocusedApp, STUDIO_WINDOW};

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
        assert_eq!(windows[0].label, STUDIO_WINDOW);
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
        let parent = dialog_parent(app.handle()).expect("the shell's window is the parent");
        assert_eq!(parent.label(), label);
    }

    fn open_window(app: &App<MockRuntime>, label: &str) {
        WebviewWindowBuilder::new(app, label, WebviewUrl::default())
            .build()
            .expect("the window opens");
    }

    #[test]
    fn the_dialogs_get_the_app_window_while_only_it_is_open() {
        let app = shell_app();
        open_window(&app, FocusedApp::Inbox.name());
        let parent = dialog_parent(app.handle()).expect("the Inbox's window is the parent");
        assert_eq!(parent.label(), FocusedApp::Inbox.name());
    }

    #[test]
    fn studios_window_is_the_parent_when_no_window_has_the_focus() {
        let app = shell_app();
        open_window(&app, FocusedApp::Messenger.name());
        open_window(&app, STUDIO_WINDOW);
        let parent = dialog_parent(app.handle()).expect("a window is the parent");
        assert_eq!(parent.label(), STUDIO_WINDOW);
    }

    #[test]
    fn the_dialogs_open_without_parent_once_the_window_is_gone() {
        let app = shell_app();
        assert!(dialog_parent(app.handle()).is_none());
    }
}
