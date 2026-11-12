//! What the shell ends in the agent host when something goes away: a
//! page's streams when the page reloads or closes, and the host itself
//! before the updater's installer replaces it.

use tauri::{AppHandle, Manager, Runtime};

use super::AgentHostState;

/// Ends every stream of the page `page`. The shell calls this when that
/// page starts loading another document, or its window closes.
pub fn end_page_streams<R: Runtime>(app: &AppHandle<R>, page: &str) {
    if let Some(state) = app.try_state::<AgentHostState>() {
        state.end_streams(|key| key.page == page);
    }
}

/// Stops the host, as dropping it does, before the updater's installer
/// replaces its file: the updater ends the shell with `exit`, which drops
/// nothing (HAL-1206).
pub fn stop_host<R: Runtime>(app: &AppHandle<R>) {
    let Some(state) = app.try_state::<AgentHostState>() else {
        return;
    };
    let host = state.host.lock().ok().and_then(|mut host| host.take());
    drop(host);
}
