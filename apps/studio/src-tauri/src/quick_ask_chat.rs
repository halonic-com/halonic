//! Handing over to Messenger (HAL-19097; design HAL-18594, section 5): the
//! box's Open in Messenger, Answer in Messenger and Last answer › hide the
//! box and open Messenger's window on the chat, through
//! `plugin:quick-ask|open_chat`, which only the `ask` window is granted.
//!
//! The chat's ID is Messenger's opaque conversation ID: the shell checks
//! only that it isn't empty or too long, and hands it to Messenger's page
//! as the `open-conversation` event. When Messenger's window had to be
//! opened, its page isn't listening yet, so the shell keeps the chat
//! instead, and the page takes it once on start through
//! `plugin:quick-ask|take_chat`, as `pending_click.rs` does for runs. Only
//! one chat waits: a newer one replaces it.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, Webview};

use crate::focused_apps::FocusedApp;

/// The event Messenger's page listens for.
pub const OPEN_CONVERSATION_EVENT: &str = "open-conversation";

/// The longest conversation ID the shell passes on, in bytes. IDs are far
/// shorter; the cap keeps a page from handing the shell a huge string.
const MOST_ID_BYTES: usize = 512;

/// What Messenger's page gets: the chat to open.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OpenConversation {
    pub conversation: String,
}

/// The chat waiting for Messenger's page, if any.
#[derive(Default)]
pub struct PendingChat(Mutex<Option<OpenConversation>>);

/// `conversation` as a chat to open, or `invalid` when it is empty or
/// longer than [`MOST_ID_BYTES`].
fn checked(conversation: String) -> Result<OpenConversation, &'static str> {
    if conversation.is_empty() || conversation.len() > MOST_ID_BYTES {
        return Err("invalid");
    }
    Ok(OpenConversation { conversation })
}

/// Shows Messenger's window and tells its page to open `chat`. When the
/// window was closed, the chat waits for its page instead.
fn hand_over<R: Runtime>(app: &AppHandle<R>, chat: OpenConversation) -> tauri::Result<()> {
    let messenger = FocusedApp::Messenger.name();
    if app.get_webview_window(messenger).is_none() {
        // Kept before the window opens, so its page can't start before it. A window that
        // didn't open drops it, so the next Messenger doesn't open that chat.
        keep(app, Some(chat));
        return crate::open_windows_track::open(app, Some(FocusedApp::Messenger))
            .inspect_err(|_| keep(app, None));
    }
    crate::open_windows_track::open(app, Some(FocusedApp::Messenger))?;
    app.emit_to(messenger, OPEN_CONVERSATION_EVENT, chat)
}

/// Keeps `chat` for Messenger's page in place of any chat that waited, or
/// drops the waiting one for `None`.
fn keep<R: Runtime>(app: &AppHandle<R>, chat: Option<OpenConversation>) {
    let Some(pending) = app.try_state::<PendingChat>() else {
        halonic_shell_log::record("quick-ask", "no place to keep a chat for Messenger");
        return;
    };
    match pending.0.lock() {
        Ok(mut waiting) => *waiting = chat,
        Err(_) => halonic_shell_log::record("quick-ask", "the waiting chat was lost"),
    }
}

/// The chat that opened Messenger's window, once, then `None`.
fn take<R: Runtime>(app: &AppHandle<R>) -> Result<Option<OpenConversation>, &'static str> {
    let pending = app.try_state::<PendingChat>().ok_or("failed")?;
    let mut waiting = pending.0.lock().map_err(|_| "failed")?;
    Ok(waiting.take())
}

/// Hides the box and opens Messenger's window on `conversation`, an opaque
/// conversation ID. Refused as `not_the_box` from any other window, as
/// `invalid` for an empty or too long ID, and as `failed` when Messenger's
/// window can't show. Async, since it may open a window, which a command
/// on the main thread can't on Windows.
#[tauri::command]
pub async fn open_chat<R: Runtime>(
    webview: Webview<R>,
    conversation: String,
) -> Result<(), &'static str> {
    let window = webview.window();
    open_chat_from(webview.app_handle(), webview.label(), conversation, || {
        // A box that didn't hide still hands over: Messenger takes the focus, which hides it.
        if let Err(error) = window.hide() {
            super::log(format!("the box didn't hide: {error}"));
        }
    })
}

/// `open_chat` from the window labelled `label`, with the box's hiding
/// passed in, so the tests see it: the mock runtime's windows don't hide.
pub fn open_chat_from<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    conversation: String,
    hide_box: impl FnOnce(),
) -> Result<(), &'static str> {
    if label != FocusedApp::Ask.name() {
        return Err("not_the_box");
    }
    let chat = checked(conversation)?;
    hide_box();
    hand_over(app, chat).map_err(|error| {
        super::log(format!("Messenger didn't open on the chat: {error}"));
        "failed"
    })
}

/// The chat the box opened Messenger's window on, once, then `None`, for
/// Messenger's page on start. Refused as `not_messenger` from any other
/// window.
#[tauri::command]
pub fn take_chat<R: Runtime>(
    webview: Webview<R>,
) -> Result<Option<OpenConversation>, &'static str> {
    if webview.label() != FocusedApp::Messenger.name() {
        return Err("not_messenger");
    }
    take(webview.app_handle())
}
