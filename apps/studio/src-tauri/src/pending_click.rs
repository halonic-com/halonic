//! A run notification's click that had to open Studio's window. The shell
//! opens the window and only then does its page start listening, so an event
//! sent at once would reach nobody. The shell keeps the click instead, and
//! the page takes it once on start with `take_pending_notification_click`
//! (HAL-18882). Only one click waits: a newer one replaces it. Taking it
//! clears it, so a reload never opens the same run twice.

use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime, State};

use crate::notification_clicks::NotificationClicked;

/// The click waiting for Studio's page, if any.
#[derive(Default)]
pub struct PendingClick(Mutex<Option<NotificationClicked>>);

/// Whether `clicked` may wait for the page: a run with its ID, or Runs'
/// Failed group. The shell keeps nothing else.
fn may_wait(clicked: &NotificationClicked) -> bool {
    let named = !clicked.messaging_id.is_empty();
    matches!(clicked.kind.as_deref(), Some("run" | "runs-failed")) && named
}

/// Keeps `clicked` for Studio's page to take, in place of any click that
/// waited before. A click of any other kind is dropped, with a line in the
/// shell's log.
pub fn hold<R: Runtime>(app: &AppHandle<R>, clicked: NotificationClicked) {
    if !may_wait(&clicked) {
        halonic_shell_log::record(
            "notifications",
            format!("a click of kind {:?} can't wait for Studio", clicked.kind),
        );
        return;
    }
    let Some(pending) = app.try_state::<PendingClick>() else {
        halonic_shell_log::record("notifications", "no place to keep a click for Studio");
        return;
    };
    match pending.0.lock() {
        Ok(mut waiting) => *waiting = Some(clicked),
        Err(_) => halonic_shell_log::record("notifications", "the waiting click was lost"),
    }
}

/// The `take_pending_notification_click` command: the click that opened
/// Studio's window, once, then `None`. It takes nothing from the page. Only
/// Studio's window is granted it
/// (capabilities/desktop-pending-notification-click.json).
#[tauri::command]
pub fn take_pending_notification_click(
    pending: State<'_, PendingClick>,
) -> Result<Option<NotificationClicked>, &'static str> {
    pending
        .0
        .lock()
        .map(|mut waiting| waiting.take())
        .map_err(|_| "failed")
}

#[cfg(test)]
#[path = "pending_click_tests.rs"]
mod tests;
