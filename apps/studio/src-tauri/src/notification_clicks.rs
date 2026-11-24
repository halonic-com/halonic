//! A click on one of the Studio's desktop notifications, told to the page.
//! `tauri-plugin-notification` shows the notification but doesn't tell the
//! page when it's clicked on desktop, so the shell does: it reads the item's
//! ID from the notification's extra data and sends it to the app window as
//! one event. The ID is the engine's opaque `MessagingId`; the shell does
//! nothing else with it, and the page decides what to open (HAL-17500).
//! Wiring this to the plugin's click comes with the notifications themselves
//! (HAL-17458).

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Runtime};

/// The event the page listens for.
pub const NOTIFICATION_CLICKED_EVENT: &str = "notification-clicked";

/// The key of the item's ID in a notification's extra data.
const ITEM_KEY: &str = "messagingId";

/// The one window the shell opens (`capabilities`).
const WINDOW_LABEL: &str = "main";

/// What the page gets for a click: the clicked notification's item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationClicked {
    pub messaging_id: String,
}

/// The item a notification's extra data names, or `None` when it names
/// none: a notification the Studio didn't send for an item.
fn clicked_item(extra: &Map<String, Value>) -> Option<NotificationClicked> {
    let id = extra.get(ITEM_KEY)?.as_str()?;
    if id.is_empty() {
        return None;
    }
    Some(NotificationClicked {
        messaging_id: id.to_owned(),
    })
}

/// Tells the app window that the notification with `extra` was clicked.
/// A notification without an item sends nothing.
#[cfg_attr(not(test), expect(dead_code))]
pub fn report_click<R: Runtime>(
    app: &AppHandle<R>,
    extra: &Map<String, Value>,
) -> tauri::Result<()> {
    match clicked_item(extra) {
        Some(clicked) => app.emit_to(WINDOW_LABEL, NOTIFICATION_CLICKED_EVENT, clicked),
        None => Ok(()),
    }
}

#[cfg(test)]
#[path = "notification_clicks_tests.rs"]
mod tests;
