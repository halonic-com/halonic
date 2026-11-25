//! A click on one of the Studio's desktop notifications, told to the page.
//! `tauri-plugin-notification` shows the notification but doesn't tell the
//! page when it's clicked on desktop, so the shell does: it reads the item's
//! ID from the notification's extra data and sends it to the app window as
//! one event. The ID is the engine's opaque `MessagingId`; the shell does
//! nothing else with it, and the page decides what to open (HAL-17500).
//! The item's kind, when the notification names one, goes along unread, so
//! the page knows where to open it. [`listen`] hands the plugin's taps to
//! [`report_click`] (HAL-17458).
//! The click goes to the window the item belongs to when it is open: an
//! Inbox item to Halonic Inbox, a conversation to Halonic Messenger. Otherwise
//! it goes to Studio's window, or to whichever app window is open, so a click
//! is never lost while only one app runs (HAL-17915).
//! A run (`run`) or Runs' Failed group (`runs-failed`) opens only in Studio's
//! window, where Runs lives until the Runs window exists, so the click brings
//! that window forward, or opens it, before telling it (HAL-18844). A window
//! it had to open takes the click itself once its page starts (HAL-18882).

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_notification::{ActionPerformed, NotificationExt};

use crate::focused_apps;

// Public to the crate, since `generate_handler!` needs the command at its own path.
#[path = "pending_click.rs"]
pub mod pending_click;

/// The event the page listens for.
pub const NOTIFICATION_CLICKED_EVENT: &str = "notification-clicked";

/// The key of the item's ID in a notification's extra data.
const ITEM_KEY: &str = "messagingId";

/// The key of the item's kind in a notification's extra data.
const KIND_KEY: &str = "kind";

/// The plugin's action ID for a click on the notification itself.
const TAP_ACTION: &str = "tap";

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

/// The windows that can open an item of `kind`, the one it belongs to first.
fn windows_for(kind: Option<&str>) -> [&'static str; 3] {
    let [studio, inbox, messenger] = focused_apps::window_labels();
    match kind {
        Some("inbox-item" | "inbox") => [inbox, studio, messenger],
        Some("conversation") => [messenger, studio, inbox],
        _ => [studio, inbox, messenger],
    }
}

/// Whether an item of `kind` opens in Runs, which only Studio's window shows.
fn opens_in_runs(kind: Option<&str>) -> bool {
    matches!(kind, Some("run" | "runs-failed"))
}

/// Tells the open window the clicked item belongs to that the notification
/// with `extra` was clicked. A run's click first shows Studio's window, and
/// waits for its page when that window was closed. A
/// notification without an item, or a click while no window is open, sends
/// nothing.
pub fn report_click<R: Runtime>(
    app: &AppHandle<R>,
    extra: &Map<String, Value>,
) -> tauri::Result<()> {
    let Some(clicked) = clicked_item(extra) else {
        return Ok(());
    };
    if opens_in_runs(clicked.kind.as_deref()) {
        return report_run_click(app, clicked);
    }
    match focused_apps::first_open(app, &windows_for(clicked.kind.as_deref())) {
        Some(window) => app.emit_to(window.label(), NOTIFICATION_CLICKED_EVENT, clicked),
        None => Ok(()),
    }
}

/// Shows Studio's window and tells it about a run's click. When the window
/// was closed its page isn't listening yet, so the click waits for the page
/// to take it instead (`pending_click.rs`).
fn report_run_click<R: Runtime>(
    app: &AppHandle<R>,
    clicked: NotificationClicked,
) -> tauri::Result<()> {
    let was_open = app
        .get_webview_window(focused_apps::STUDIO_WINDOW)
        .is_some();
    if !was_open {
        // Kept before the window opens, so its page can't start before it. A window that
        // didn't open drops it, so it can't open that run the next time Studio opens.
        pending_click::hold(app, clicked);
        return focused_apps::show(app, None).inspect_err(|_| pending_click::forget(app));
    }
    focused_apps::show(app, None)?;
    app.emit_to(
        focused_apps::STUDIO_WINDOW,
        NOTIFICATION_CLICKED_EVENT,
        clicked,
    )
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
