//! The navigation guard: links and redirects in the app window go through
//! it (`halonic_connect::navigation_destination_with` decides), and every page
//! that loads is checked again, with the same answer, because
//! Android WebView doesn't ask about POST requests. The served Studio has no
//! capability, so this guard and the confirmed address are all the shell
//! knows about it.

use std::sync::Mutex;

use halonic_connect::{
    Address, Build, Destination, DevServer, NavigationTarget, is_own_page,
    navigation_destination_with,
};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime, Url, Webview};
use tauri_plugin_opener::OpenerExt;

/// The page `back_to_connect` loads: the app's own page, which is the connect
/// page on Android (tauri.android.conf.json) and the Studio on desktop
/// (tauri.conf.json), the only page the guard keeps. On Android,
/// `#page-not-shown` tells the connect page to show the connect screen with
/// the remembered address filled in, instead of connecting straight away,
/// and a line saying the page the window was on can't be shown here.
const CHANGE_ADDRESS_PAGE: &str = if cfg!(target_os = "android") {
    "http://tauri.localhost/connect.html#page-not-shown"
} else if cfg!(windows) {
    "http://tauri.localhost/studio.html"
} else {
    "tauri://localhost/studio.html"
};

/// The address the last Connect confirmed: the only one, besides the
/// connect page, that may load in the app window.
#[derive(Default)]
pub struct ConfirmedAddress(Mutex<Option<Address>>);

impl ConfirmedAddress {
    pub fn set(&self, address: Option<Address>) {
        *self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = address;
    }

    fn get(&self) -> Option<Address> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

/// The guard, as a small plugin so it sees every webview's navigations.
pub fn guard<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("navigation-guard")
        .on_navigation(on_navigation)
        .on_page_load(|webview, payload| {
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            if webview.label() == crate::server_session_brief::WINDOW {
                crate::server_session_brief::on_page_load(webview, payload.url());
                return;
            }
            // A page the guard was never asked about, such as a form sent
            // with POST on Android. It can't be sent again to the browser,
            // so the window goes back to the connect screen.
            if destination(webview, &target(payload.url())) != Destination::Stay {
                back_to_connect(webview);
            }
        })
        .build()
}

/// Decides one navigation: true lets it load in the window.
pub(crate) fn on_navigation<R: Runtime>(webview: &Webview<R>, url: &Url) -> bool {
    // The brief window loads only its own page (`server_session_brief.rs`).
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    if webview.label() == crate::server_session_brief::WINDOW {
        return crate::server_session_brief::on_navigation(webview, url);
    }
    let going_to = target(url);
    match destination(webview, &going_to) {
        Destination::Stay => {
            // Leaving the app's own page for the served Studio: the phone
            // tunnel's events and the computer picker's list stop here,
            // before that page loads (H1 on HAL-15181, HAL-16824).
            if !is_own_page(&going_to, dev_server(webview.app_handle()).as_ref()) {
                crate::phone_tunnel_events::end_page_watch(webview.app_handle(), webview.label());
                crate::phone_nearby::end_page(webview.app_handle());
            }
            true
        }
        Destination::BackToConnect => {
            // The desktop has no connect screen: the Studio is already
            // showing, and loading it again would drop what the user hasn't
            // saved. The link only cancels.
            if cfg!(target_os = "android") {
                back_to_connect(webview);
            }
            false
        }
        Destination::Browser => {
            open_in_browser(webview.app_handle(), url);
            false
        }
        Destination::Nowhere => false,
    }
}

/// Where `going_to` goes: the confirmed address and the app's own page stay,
/// and in a debug build so does the page `tauri dev` serves (HAL-19823).
fn destination<R: Runtime>(webview: &Webview<R>, going_to: &NavigationTarget) -> Destination {
    let confirmed = webview.state::<ConfirmedAddress>().get();
    let dev_server = dev_server(webview.app_handle());
    navigation_destination_with(going_to, confirmed.as_ref(), dev_server.as_ref())
}

/// The dev server the window's page comes from under `tauri dev`: the
/// config's `devUrl`, which the Tauri CLI fills in, and only in a debug
/// build. A release build has none, whatever the config says.
pub(crate) fn dev_server<R: Runtime>(app: &AppHandle<R>) -> Option<DevServer> {
    let dev_url = app.config().build.dev_url.as_ref().map(Url::as_str);
    DevServer::for_build(dev_url, Build::current())
}

/// The parts of `url` the navigation checks read.
pub(crate) fn target(url: &Url) -> NavigationTarget<'_> {
    NavigationTarget {
        scheme: url.scheme(),
        host: url.host_str(),
        port: url.port_or_known_default(),
        path: url.path(),
        query: url.query(),
        fragment: url.fragment(),
    }
}

/// Hands `url` to the browser and returns straight away. On Android the
/// guard runs on the UI thread, inside the WebView's link callback, and the
/// opener sends its request to that same thread and waits for the answer.
/// Called from the guard itself, it waited for itself, and the app froze
/// until Android said it wasn't responding (HAL-1375 phone checks 6, 16 and
/// 23). The release page button never froze: its call comes from the page,
/// off the UI thread.
fn open_in_browser<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    let app = app.clone();
    let url = url.to_string();
    off_the_calling_thread(move || {
        // If nothing can open it, the tap does nothing; the log says why.
        if let Err(error) = app.opener().open_url(url, None::<&str>) {
            halonic_shell_log::record(
                "navigation",
                format!("opening a link in the browser: {error}"),
            );
        }
    });
}

/// Runs `work` on a thread of its own, so the caller never waits for it,
/// and `work` may wait for the caller's thread.
fn off_the_calling_thread(work: impl FnOnce() + Send + 'static) {
    tauri::async_runtime::spawn_blocking(work);
}

/// Forgets the confirmed address and loads the connect page in its Change
/// address state. The load waits until the guard has returned, because the
/// webview is still deciding the cancelled navigation or loading the page.
fn back_to_connect<R: Runtime>(webview: &Webview<R>) {
    webview.state::<ConfirmedAddress>().set(None);
    let webview = webview.clone();
    tauri::async_runtime::spawn(async move {
        let page = Url::parse(CHANGE_ADDRESS_PAGE).expect("a valid page address");
        let _ = webview.navigate(page);
    });
}

#[cfg(test)]
#[path = "navigation_tests.rs"]
mod tests;
