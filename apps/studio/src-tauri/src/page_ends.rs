//! What the shell ends for a page. A page that reloads or closes can't end
//! its agent host streams and file watches itself, so the shell ends them.
//! A page that loads starts the timer of Studio's start; a window that
//! closes also lets go of its engine lock, and Studio's hides to the tray
//! instead of closing.

use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{Manager, Runtime, Webview, Window, WindowEvent};

use crate::{
    agent_host, engine, engine_lock, files, http_fetch, pair_scan, phone_nearby, phone_tunnel,
};

/// A page in `webview` started loading: what its last page started ends.
pub fn page_load<R: Runtime>(webview: &Webview<R>, payload: &PageLoadPayload<'_>) {
    if payload.event() != PageLoadEvent::Started {
        return;
    }
    agent_host::page_loaded(webview.app_handle());
    agent_host::end_page_streams(webview.app_handle(), webview.label());
    engine::end_page(webview.app_handle(), webview.label());
    http_fetch::end_page_calls(webview.app_handle(), webview.label());
    #[cfg(desktop)]
    crate::actions::end_page(webview.app_handle(), webview.label());
    files::end_page_watches(webview.app_handle(), webview.label());
    pair_scan::end_page_scan(webview.app_handle());
    phone_tunnel::end_page(webview.app_handle(), webview.label());
    phone_nearby::end_page(webview.app_handle());
    #[cfg(desktop)]
    crate::updates::end_page_watches(webview.app_handle(), webview.label());
}

/// `window` asked to close, or closed: what its page started ends.
pub fn window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    #[cfg(desktop)]
    if let WindowEvent::CloseRequested { api, .. } = event {
        crate::tray::close_requested(window, api);
    }
    // After the tray's close, so a window it hid counts as closed.
    #[cfg(desktop)]
    crate::open_windows_track::window_event(window, event);
    if !matches!(event, WindowEvent::Destroyed) {
        return;
    }
    window
        .app_handle()
        .state::<engine_lock::EngineLockState>()
        .release_window(window.label());
    agent_host::end_page_streams(window.app_handle(), window.label());
    engine::end_page(window.app_handle(), window.label());
    #[cfg(desktop)]
    crate::engines::window_closed(window.app_handle(), window.label());
    http_fetch::end_page_calls(window.app_handle(), window.label());
    #[cfg(desktop)]
    crate::actions::end_page(window.app_handle(), window.label());
    files::end_page_watches(window.app_handle(), window.label());
    pair_scan::end_page_scan(window.app_handle());
    phone_tunnel::end_page(window.app_handle(), window.label());
    phone_nearby::end_page(window.app_handle());
    #[cfg(desktop)]
    crate::updates::end_page_watches(window.app_handle(), window.label());
}
