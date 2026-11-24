//! A click on one of the Studio's desktop notifications, told to the page.
//! `tauri-plugin-notification` shows the notification but doesn't tell the
//! page when it's clicked on desktop, so the shell does: it reads the item's
//! ID from the notification's extra data and sends it to the app window as
//! one event. The ID is the engine's opaque `MessagingId`; the shell does
//! nothing else with it, and the page decides what to open (HAL-17500).
//! The item's kind, when the notification names one, goes along unread, so
//! the page knows where to open it. [`listen`] hands the plugin's taps to
//! [`report_click`] (HAL-17458).

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_notification::{ActionPerformed, NotificationExt};

/// The event the page listens for.
pub const NOTIFICATION_CLICKED_EVENT: &str = "notification-clicked";

/// The key of the item's ID in a notification's extra data.
const ITEM_KEY: &str = "messagingId";

/// The key of the item's kind in a notification's extra data.
const KIND_KEY: &str = "kind";

/// The plugin's action ID for a click on the notification itself.
const TAP_ACTION: &str = "tap";

/// The one window the shell opens (`capabilities`).
const WINDOW_LABEL: &str = "main";

/// What the page gets for a click: the clicked notification's item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationClicked {
    pub messaging_id: String,
    /// The item's kind, such as `inbox-item`, when the notification names one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

/// The item a notification's extra data names, or `None` when it names
/// none: a notification the Studio didn't send for an item.
fn clicked_item(extra: &Map<String, Value>) -> Option<NotificationClicked> {
    let id = extra.get(ITEM_KEY)?.as_str()?;
    if id.is_empty() {
        return None;
    }
    let kind = extra
        .get(KIND_KEY)
        .and_then(Value::as_str)
        .filter(|kind| !kind.is_empty())
        .map(str::to_owned);
    Some(NotificationClicked {
        messaging_id: id.to_owned(),
        kind,
    })
}

/// Tells the app window that the notification with `extra` was clicked.
/// A notification without an item sends nothing.
pub fn report_click<R: Runtime>(
    app: &AppHandle<R>,
    extra: &Map<String, Value>,
) -> tauri::Result<()> {
    match clicked_item(extra) {
        Some(clicked) => app.emit_to(WINDOW_LABEL, NOTIFICATION_CLICKED_EVENT, clicked),
        None => Ok(()),
    }
}

/// Reports a tap from the plugin; a click on one of a notification's
/// buttons, or a tap whose notification the system didn't describe, sends
/// nothing.
pub fn report_action<R: Runtime>(
    app: &AppHandle<R>,
    performed: &ActionPerformed,
) -> tauri::Result<()> {
    if performed.action_id() != TAP_ACTION {
        return Ok(());
    }
    let Some(notification) = performed.notification() else {
        return Ok(());
    };
    let extra: Map<String, Value> = notification
        .extra()
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    report_click(app, &extra)
}

/// Hands every tap on a Studio notification to the page. Registered at start,
/// because the plugin reports nothing for a notification shown before.
pub fn listen<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    let listening = app.notification().on_action(move |performed| {
        if let Err(error) = report_action(&handle, performed) {
            halonic_shell_log::record(
                "notifications",
                format!("couldn't tell the page about a click: {error}"),
            );
        }
    });
    if let Err(error) = listening {
        halonic_shell_log::record(
            "notifications",
            format!("clicks on notifications won't open Studio: {error}"),
        );
    }
}

#[cfg(test)]
#[path = "notification_clicks_tests.rs"]
mod tests;
