//! The host routes quick ask's box may call (HAL-19520). The box is the one
//! window that opens over other apps, and its capability grants
//! `agent_host_request` only so it can ask through Messenger's chats. So a
//! compromised box page would otherwise reach the host's whole table:
//! sandbox sessions, setup and removal, harness runs, plugin and connector
//! calls. The shell refuses it every route but the three its page calls.
//! Every other window keeps the whole table.

use super::HostRefusal;

/// The box's window label, `FocusedApp::Ask`'s name. That type is desktop
/// only, and the agent host commands aren't.
pub(super) const BOX_WINDOW: &str = "ask";

/// The routes the box's page calls: its agents' chats and their messages,
/// the question, and the wait for the answer.
pub(super) const BOX_ROUTES: [&str; 3] = [
    "POST /v1/messaging/read",
    "POST /v1/messaging/send",
    "POST /v1/messaging/changes",
];

/// `Ok` when the window labelled `window` may call `route`: any route from
/// any window but the box, and only [`BOX_ROUTES`] from the box, which is
/// refused any other as `not_for_the_box` before anything reaches the host.
pub(super) fn window_may_call(window: &str, route: &str) -> Result<(), HostRefusal> {
    if window != BOX_WINDOW || BOX_ROUTES.contains(&route) {
        return Ok(());
    }
    Err(HostRefusal::new(
        "not_for_the_box",
        format!("quick ask's box may not call {route:?}"),
    ))
}
