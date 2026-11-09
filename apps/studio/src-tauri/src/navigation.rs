//! The navigation guard: every link and redirect in the app window goes
//! through it (`halonic_connect::navigation_destination` decides). The
//! served Studio has no capability, so this guard and the confirmed address
//! are all the shell knows about it.

use std::sync::Mutex;

use halonic_connect::{Address, Destination, NavigationTarget, navigation_destination};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime, Url, Webview};
use tauri_plugin_opener::OpenerExt;

/// The connect page, as the Android window loads it
/// (tauri.android.conf.json). `#change-address` tells the page to show the
/// connect screen with the remembered address filled in, instead of
/// connecting straight away.
const CHANGE_ADDRESS_PAGE: &str = if cfg!(any(windows, target_os = "android")) {
    "http://tauri.localhost/connect.html#change-address"
} else {
    "tauri://localhost/connect.html#change-address"
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
        .on_navigation(|webview, url| {
            let confirmed = webview.state::<ConfirmedAddress>().get();
            match navigation_destination(&target(url), confirmed.as_ref()) {
                Destination::Stay => true,
                Destination::BackToConnect => {
                    back_to_connect(webview);
                    false
                }
                Destination::Browser => {
                    // If no browser can open it, the tap does nothing.
                    let _ = webview.opener().open_url(url.as_str(), None::<&str>);
                    false
                }
                Destination::Nowhere => false,
            }
        })
        .build()
}

fn target(url: &Url) -> NavigationTarget<'_> {
    NavigationTarget {
        scheme: url.scheme(),
        host: url.host_str(),
        port: url.port_or_known_default(),
    }
}

/// Forgets the confirmed address and loads the connect page in its Change
/// address state. The load waits until the guard has returned, because the
/// webview is still deciding the cancelled navigation.
fn back_to_connect<R: Runtime>(webview: &Webview<R>) {
    webview.state::<ConfirmedAddress>().set(None);
    let webview = webview.clone();
    tauri::async_runtime::spawn(async move {
        let page = Url::parse(CHANGE_ADDRESS_PAGE).expect("a valid page address");
        let _ = webview.navigate(page);
    });
}
