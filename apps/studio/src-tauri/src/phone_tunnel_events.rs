//! The phone tunnel's events, on the channel the app's own page hands in
//! with `phone_tunnel_watch` (H1 on HAL-15181). The address path loads the
//! computer's served Studio into the same `main` window, and Tauri delivers
//! a channel's messages by running script in whatever page is loaded at
//! that moment, so a capability alone doesn't keep them from that page.
//! Three things do:
//!
//! - A page may start watching only while the window is on the app's own
//!   page.
//! - The navigation guard drops the window's channels when it lets the
//!   window leave the app's own page, before the next page loads, and every
//!   page load drops them too.
//! - Each event checks the window's page again just before it is sent, and
//!   drops a channel whose window is anywhere else.
//!
//! Back on the app's own page, the page watches again and gets each
//! computer's current status first, then each open session. A session's
//! opening and its host messages (D7a, HAL-15177) take the same way, so
//! the served page never gets a message's text either.

use std::sync::{Mutex, PoisonError};

use halonic_connect::is_own_page;
use halonic_phone_tunnel::PageStatus;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, Webview};

use crate::navigation::{dev_server, target};

/// One event on the page's channel, tagged by `kind`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum TunnelEvent {
    /// A paired computer's connection state. Only Android's tunnel sends
    /// it; other platforms never have a paired computer.
    #[cfg_attr(not(any(target_os = "android", test)), expect(dead_code))]
    Status {
        computer: String,
        status: PageStatus,
    },
    /// A session to the computer opened: the page sends `hello` on it.
    /// `generation` names it, and is never given to another session.
    #[cfg_attr(not(any(target_os = "android", test)), expect(dead_code))]
    SessionOpened { computer: String, generation: u64 },
    /// One host message of the session `generation`, as text the page
    /// reads with its own strict parser.
    #[cfg_attr(not(any(target_os = "android", test)), expect(dead_code))]
    Message {
        computer: String,
        generation: u64,
        text: String,
    },
}

/// The channels pages watch through, by the label of their webview.
#[derive(Default)]
pub struct TunnelWatchers(Mutex<Vec<(String, Channel<TunnelEvent>)>>);

/// Starts sending events to `channel`, after `current`: each computer's
/// latest status and open session. Answers false, and keeps nothing, unless
/// the webview is on the app's own page.
pub fn watch<R: Runtime>(
    webview: &Webview<R>,
    channel: Channel<TunnelEvent>,
    current: Vec<TunnelEvent>,
) -> bool {
    let Some(watchers) = webview.try_state::<TunnelWatchers>() else {
        return false;
    };
    let mut watchers = watchers.0.lock().unwrap_or_else(PoisonError::into_inner);
    if !on_app_page(webview) {
        return false;
    }
    for event in current {
        if channel.send(event).is_err() {
            return false;
        }
    }
    watchers.push((webview.label().to_owned(), channel));
    true
}

/// Sends `event` to every page that watches from the app's own page, and
/// drops each channel whose webview has gone or is on any other page.
#[cfg_attr(not(any(target_os = "android", test)), expect(dead_code))]
pub fn tell<R: Runtime>(app: &AppHandle<R>, event: &TunnelEvent) {
    let Some(watchers) = app.try_state::<TunnelWatchers>() else {
        return;
    };
    let mut watchers = watchers.0.lock().unwrap_or_else(PoisonError::into_inner);
    watchers.retain(|(label, channel)| {
        let Some(window) = app.get_webview_window(label) else {
            return false;
        };
        on_app_page(window.as_ref()) && channel.send(event.clone()).is_ok()
    });
}

/// Drops the channels of the webview `label`: its page is leaving or
/// reloading, or the window closed.
pub fn end_page_watch<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Some(watchers) = app.try_state::<TunnelWatchers>() {
        let mut watchers = watchers.0.lock().unwrap_or_else(PoisonError::into_inner);
        watchers.retain(|(watching, _)| watching != label);
    }
}

/// How many channels are kept, for tests.
#[cfg(test)]
pub fn watching<R: Runtime>(app: &AppHandle<R>) -> usize {
    app.try_state::<TunnelWatchers>()
        .map(|watchers| {
            watchers
                .0
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .len()
        })
        .unwrap_or(0)
}

/// Whether the webview shows the app's own page, the only page the
/// navigation guard keeps besides the confirmed address (and, in a debug
/// build, the same page from `tauri dev`'s server).
pub fn on_app_page<R: Runtime>(webview: &Webview<R>) -> bool {
    let dev_server = dev_server(webview.app_handle());
    webview
        .url()
        .is_ok_and(|url| is_own_page(&target(&url), dev_server.as_ref()))
}
