//! Quick ask's handover to Messenger (HAL-18961; design HAL-18594, section
//! 5). **Open in Messenger**, **Answer in Messenger** and **Last answer ›**
//! in the box ask the shell, through `plugin:quick-ask|open_chat`, to show
//! Messenger's window on a chat: the window comes forward when it is open,
//! or opens. The box hides only once Messenger shows, so a window that
//! didn't show leaves the box up to say so.
//!
//! An open Messenger window hears the chat as a click on a conversation's
//! notification (`notification-clicked`), so its page opens it the same
//! way. A window the shell has to open starts its page only after that, so
//! the shell keeps the chat instead, and the page takes it once on start
//! through `plugin:quick-ask|take_chat`. Only one chat waits: a newer one
//! replaces it. The chat's ID is the engine's opaque `MessagingId`; the
//! shell does nothing else with it.

use std::sync::{Mutex, PoisonError};

use tauri::{AppHandle, Emitter, Manager, Runtime, State, Webview};

use crate::focused_apps::{self, FocusedApp};
use crate::notification_clicks::{NOTIFICATION_CLICKED_EVENT, NotificationClicked};

/// The kind Messenger's page gets a chat as, as a notification names it.
const CONVERSATION: &str = "conversation";

/// The longest chat ID the box may hand over. The engine's IDs are far
/// shorter; the limit only keeps a page from making the shell hold any
/// length of text.
const LONGEST_ID: usize = 512;

/// The chat waiting for Messenger's page, if any.
#[derive(Default)]
pub struct HeldChat(Mutex<Option<NotificationClicked>>);

fn keep<R: Runtime>(app: &AppHandle<R>, chat: Option<NotificationClicked>) {
    let held = app.state::<HeldChat>();
    *held.0.lock().unwrap_or_else(PoisonError::into_inner) = chat;
}

/// Shows Messenger's window on `conversation`: tells the open window, or
/// keeps the chat for the window it opens. A window that didn't open drops
/// the chat, so it can't open the next time Messenger opens.
pub fn hand_over<R: Runtime>(app: &AppHandle<R>, conversation: String) -> tauri::Result<()> {
    let chat = NotificationClicked {
        messaging_id: conversation,
        kind: Some(CONVERSATION.to_owned()),
    };
    let messenger = FocusedApp::Messenger.name();
    if app.get_webview_window(messenger).is_some() {
        focused_apps::show(app, Some(FocusedApp::Messenger))?;
        return app.emit_to(messenger, NOTIFICATION_CLICKED_EVENT, chat);
    }
    // Kept before the window opens, so its page can't start before it.
    keep(app, Some(chat));
    focused_apps::show(app, Some(FocusedApp::Messenger)).inspect_err(|_| keep(app, None))
}

/// Shows Messenger's window on the chat `conversation`, then hides the box.
/// Refused as `not_the_box` from any other window, `invalid` for an empty
/// or overlong ID, and `failed` when Messenger's window didn't show, with
/// the reason in the shell's log; the box then stays. Async, so Messenger's
/// window opens off the main thread, which opening it needs.
#[tauri::command]
pub async fn open_chat<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    conversation: String,
) -> Result<(), &'static str> {
    if webview.label() != FocusedApp::Ask.name() {
        return Err("not_the_box");
    }
    if conversation.is_empty() || conversation.len() > LONGEST_ID {
        return Err("invalid");
    }
    hand_over(&app, conversation).map_err(|error| {
        halonic_shell_log::record("quick-ask", format!("Messenger didn't show: {error}"));
        "failed"
    })?;
    webview.window().hide().map_err(|_| "failed")
}

/// The chat that opened Messenger's window, once, then `None`, as
/// `{ messagingId, kind: "conversation" }`. It takes nothing from the page.
/// Refused as `not_messenger` from any other window.
#[tauri::command]
pub fn take_chat<R: Runtime>(
    webview: Webview<R>,
    held: State<'_, HeldChat>,
) -> Result<Option<NotificationClicked>, &'static str> {
    if webview.label() != FocusedApp::Messenger.name() {
        return Err("not_messenger");
    }
    Ok(held.0.lock().unwrap_or_else(PoisonError::into_inner).take())
}

#[cfg(test)]
#[path = "quick_ask_chat_tests.rs"]
mod tests;
