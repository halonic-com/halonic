//! The typed route's computer picker (HAL-16824): `phone_nearby_browse`
//! lists the Halonic computers on this Wi-Fi to the app's own page while the
//! picker is open, and `phone_nearby_stop` ends that when it closes. Android
//! only (`capabilities/phone-nearby.json`, a local capability), so the
//! Studio a computer serves gets neither.
//!
//! The Kotlin `NearbyComputersPlugin` browses with Android's `NsdManager`
//! and passes each resolved hit to the shell on a channel the shell made,
//! never to a page. The shell checks it and keeps it in
//! [`NearbyComputers`]; the page gets only names and opaque ids, as the
//! whole list on its own channel each time the list changes. The page
//! pairs with an id (`phone_pair_start`'s `nearby` start), and the shell
//! looks the address up here.
//!
//! Browsing stops when the page calls `phone_nearby_stop`, when the window
//! leaves the app's own page or starts loading a page, and while the app is
//! in the background: the Kotlin side stops when Android pauses the app,
//! tells the shell to clear the list, and browses again when it comes back.
//! Each browse has its own number, so a hit that arrives late from an
//! earlier browse changes nothing.

use std::sync::{Mutex, PoisonError};

use halonic_phone_tunnel::{Hit, NearbyComputers, NearbyView};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, Webview};

use crate::phone_tunnel_events::on_app_page;

/// One event on the page's channel, tagged by `kind`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum NearbyEvent {
    /// The whole list, by name: first an empty one, then on every change.
    Computers { computers: Vec<NearbyView> },
}

/// How `phone_nearby_browse` started, tagged by `kind`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum NearbyStart {
    /// Only Android browses.
    #[cfg_attr(not(target_os = "android"), expect(dead_code))]
    Browsing,
    /// Android's "Nearby devices" was turned down; `ask_again` as for the
    /// tunnel's `no-local-network`. Only Android builds it.
    #[cfg_attr(not(target_os = "android"), expect(dead_code))]
    NoLocalNetwork { ask_again: bool },
    /// Not the Android app, or Android's service couldn't start.
    Unavailable,
}

/// What the Kotlin side saw in browse `browse`. Only Android and the tests
/// read it.
#[derive(Debug, Deserialize)]
#[cfg_attr(not(any(target_os = "android", test)), allow(dead_code))]
pub struct Seen {
    pub browse: u64,
    #[serde(flatten)]
    pub change: Change,
}

/// One change from the Kotlin side, tagged by `kind`.
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
#[cfg_attr(not(any(target_os = "android", test)), allow(dead_code))]
pub enum Change {
    /// A hit resolved, or resolved again.
    Found(Hit),
    /// A computer stopped advertising.
    Lost { key: String },
    /// The app went to the background, or Android's search failed.
    Cleared,
}

/// The picker's browse: the list, and the page that watches it.
#[derive(Default)]
pub struct NearbyState(Mutex<Browse>);

#[derive(Default)]
struct Browse {
    list: NearbyComputers,
    /// The page's webview label and channel, while the picker is open.
    page: Option<(String, Channel<NearbyEvent>)>,
    /// The number of the browse in progress, or of the last one.
    browse: u64,
}

impl Browse {
    fn computers(&self) -> NearbyEvent {
        NearbyEvent::Computers {
            computers: self.list.view(),
        }
    }

    /// Ends the browse in progress: later hits from it change nothing.
    fn end(&mut self) {
        self.page = None;
        self.browse += 1;
    }
}

/// Starts listing the computers on this Wi-Fi to the page, on `on_event`:
/// an empty list at once, then the whole list on every change. Asks
/// Android's "Nearby devices" first. A new browse replaces the last one.
#[tauri::command]
pub async fn phone_nearby_browse<R: Runtime>(
    webview: Webview<R>,
    on_event: Channel<NearbyEvent>,
) -> NearbyStart {
    if !cfg!(target_os = "android") || !on_app_page(&webview) {
        return NearbyStart::Unavailable;
    }
    #[cfg(target_os = "android")]
    {
        use crate::local_network::{Answer, allowed};
        if let Answer::TurnedDown { ask_again } = allowed(webview.app_handle()).await {
            return NearbyStart::NoLocalNetwork { ask_again };
        }
        let Some(browse) = begin(&webview, on_event) else {
            return NearbyStart::Unavailable;
        };
        let app = webview.app_handle();
        if !android::browse(app, browse).await {
            stop(app);
            return NearbyStart::Unavailable;
        }
        if browsing(app, browse) {
            return NearbyStart::Browsing;
        }
        // A stop came while Android was starting, and its Kotlin `stop` may
        // have run before the Kotlin `browse`: stop again, now that the
        // search has started, so Android doesn't keep searching.
        android::stop(app).await;
    }
    #[cfg(not(target_os = "android"))]
    let _ = on_event;
    NearbyStart::Unavailable
}

/// The picker closed. The computers found stay listed, so the page can
/// still pair with one by its id, until the next browse or the page leaves.
#[tauri::command]
pub async fn phone_nearby_stop<R: Runtime>(app: AppHandle<R>) {
    stop(&app);
    #[cfg(target_os = "android")]
    android::stop(&app).await;
}

/// Starts a browse for the page: clears the list, sends it the empty list
/// and keeps its channel. Answers the browse's number, or `None`, keeping
/// nothing, unless the webview is on the app's own page.
#[cfg_attr(not(any(target_os = "android", test)), expect(dead_code))]
pub fn begin<R: Runtime>(webview: &Webview<R>, channel: Channel<NearbyEvent>) -> Option<u64> {
    let state = webview.try_state::<NearbyState>()?;
    let mut browse = state.0.lock().unwrap_or_else(PoisonError::into_inner);
    browse.end();
    browse.list.clear();
    if !on_app_page(webview) || channel.send(browse.computers()).is_err() {
        return None;
    }
    browse.page = Some((webview.label().to_owned(), channel));
    Some(browse.browse)
}

/// Whether browse `browse` is still in progress, with a page watching: no
/// stop, page load or newer browse has ended it.
#[cfg_attr(not(any(target_os = "android", test)), expect(dead_code))]
pub fn browsing<R: Runtime>(app: &AppHandle<R>, browse: u64) -> bool {
    app.try_state::<NearbyState>().is_some_and(|state| {
        let current = state.0.lock().unwrap_or_else(PoisonError::into_inner);
        current.browse == browse && current.page.is_some()
    })
}

/// Applies what the Kotlin side saw, and sends the page the new list when
/// it changed. Anything from a browse that has ended changes nothing. A
/// page that has left the app's own page loses its channel.
#[cfg_attr(not(any(target_os = "android", test)), expect(dead_code))]
pub fn seen<R: Runtime>(app: &AppHandle<R>, seen: Seen) {
    let Some(state) = app.try_state::<NearbyState>() else {
        return;
    };
    let mut browse = state.0.lock().unwrap_or_else(PoisonError::into_inner);
    if seen.browse != browse.browse || browse.page.is_none() {
        return;
    }
    let changed = match seen.change {
        Change::Found(hit) => browse.list.found(hit),
        Change::Lost { key } => browse.list.lost(&key),
        Change::Cleared => browse.list.clear(),
    };
    if !changed {
        return;
    }
    let event = browse.computers();
    let sent = browse.page.as_ref().is_some_and(|(label, channel)| {
        app.get_webview_window(label)
            .is_some_and(|window| on_app_page(window.as_ref()))
            && channel.send(event).is_ok()
    });
    if !sent {
        browse.end();
    }
}

/// The endpoint of the computer the page picked by `id`.
pub fn endpoint<R: Runtime>(app: &AppHandle<R>, id: &str) -> Option<String> {
    let state = app.try_state::<NearbyState>()?;
    let browse = state.0.lock().unwrap_or_else(PoisonError::into_inner);
    browse.list.endpoint(id)
}

/// Ends the browse in progress and keeps the list.
pub fn stop<R: Runtime>(app: &AppHandle<R>) {
    if let Some(state) = app.try_state::<NearbyState>() {
        state.0.lock().unwrap_or_else(PoisonError::into_inner).end();
    }
}

/// Ends the picker of a page that is leaving the app's own page, starting
/// to load or closing: the browse stops and the list goes, since its ids
/// belonged to that page.
pub fn end_page<R: Runtime>(app: &AppHandle<R>) {
    if let Some(state) = app.try_state::<NearbyState>() {
        let mut browse = state.0.lock().unwrap_or_else(PoisonError::into_inner);
        browse.end();
        browse.list.clear();
    }
    #[cfg(target_os = "android")]
    {
        let app = app.clone();
        tauri::async_runtime::spawn(async move { android::stop(&app).await });
    }
}

/// Whether a page is watching, for tests.
#[cfg(test)]
pub fn watching<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<NearbyState>().is_some_and(|state| {
        state
            .0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .page
            .is_some()
    })
}

#[cfg(target_os = "android")]
mod android {
    use serde::Serialize;
    use serde::de::IgnoredAny;
    use tauri::ipc::{Channel, InvokeResponseBody};
    use tauri::plugin::{PluginHandle, TauriPlugin};
    use tauri::{AppHandle, Manager, Runtime};

    use super::Seen;

    /// The Kotlin side, and the one channel it sends every hit on.
    struct Nearby<R: Runtime> {
        plugin: PluginHandle<R>,
        hits: Channel,
    }

    /// The Kotlin `browse` command's arguments.
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct BrowseArgs {
        on_hit: Channel,
        browse: u64,
    }

    /// Loads the Kotlin side, which only Android has. No capability grants
    /// its commands, so only the shell calls them, from Rust.
    pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
        tauri::plugin::Builder::new("phone-nearby")
            .setup(|app, api| {
                let plugin =
                    api.register_android_plugin("com.halonic.studio", "NearbyComputersPlugin")?;
                let handle = app.clone();
                // Text that doesn't read as a change is dropped: it comes
                // from our own plugin, so it is a bug, not an attack.
                let hits = Channel::new(move |body| {
                    if let InvokeResponseBody::Json(text) = body
                        && let Ok(seen) = serde_json::from_str::<Seen>(&text)
                    {
                        super::seen(&handle, seen);
                    }
                    Ok(())
                });
                app.manage(Nearby { plugin, hits });
                Ok(())
            })
            .build()
    }

    /// Starts Android's search for browse `browse`, ending any earlier one.
    /// Answers whether it started.
    pub async fn browse<R: Runtime>(app: &AppHandle<R>, browse: u64) -> bool {
        let Some(nearby) = app.try_state::<Nearby<R>>() else {
            return false;
        };
        let args = BrowseArgs {
            on_hit: nearby.hits.clone(),
            browse,
        };
        nearby
            .plugin
            .run_mobile_plugin_async::<IgnoredAny>("browse", args)
            .await
            .is_ok()
    }

    /// Stops Android's search. A plugin that fails has nothing to stop.
    pub async fn stop<R: Runtime>(app: &AppHandle<R>) {
        if let Some(nearby) = app.try_state::<Nearby<R>>() {
            let _ = nearby
                .plugin
                .run_mobile_plugin_async::<IgnoredAny>("stop", ())
                .await;
        }
    }
}

#[cfg(target_os = "android")]
pub use android::plugin;
