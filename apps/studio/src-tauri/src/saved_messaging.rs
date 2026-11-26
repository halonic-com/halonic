//! The phone's saved Inbox and Messenger (phase 2 G3b, HAL-19026,
//! architecture note on HAL-17511, section 2.4): the page's
//! `SavedDataStore`. The page hands over one computer's text and gets it
//! back; the shell keeps it in the app's private data, sealed by the
//! Android Keystore key the device keys use (`device_keys::SavedTexts`),
//! and never reads it.
//!
//! Android only (`capabilities/phone-tunnel.json`, a local capability), and
//! only while the window is on the app's own page, as `tunnel_send`. A
//! write over 20 MB is refused. Forget (`phone_forget`) and Removed (the
//! tunnel's status) delete the computer's file in the shell too, so it goes
//! even when the page isn't there to ask.
//!
//! Each call waits for the Android Keystore, so it runs on a blocking
//! thread, never Android's main thread, one at a time.

use tauri::{Runtime, Webview};

/// What the page gets when it can't use the saved text here.
const UNAVAILABLE: &str = "the phone's saved data isn't available";

/// The text saved for `computer`, `None` when there is none or it no longer
/// opens (then it is deleted).
#[tauri::command]
pub async fn phone_saved_read<R: Runtime>(
    webview: Webview<R>,
    computer: String,
) -> Result<Option<String>, String> {
    #[cfg(target_os = "android")]
    if let Some(saved) = android::Saved::for_page(&webview) {
        return saved
            .call(computer, |store, id| store.read(id).map_err(described))
            .await;
    }
    #[cfg(not(target_os = "android"))]
    let _ = (webview, computer);
    Err(UNAVAILABLE.to_owned())
}

/// Replaces what is saved for `computer`; refused with `too-large` over
/// 20 MB.
#[tauri::command]
pub async fn phone_saved_write<R: Runtime>(
    webview: Webview<R>,
    computer: String,
    text: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    if let Some(saved) = android::Saved::for_page(&webview) {
        return saved
            .call(computer, move |store, id| {
                store.write(id, &text).map_err(|error| match error {
                    halonic_device_keys::SavedTextError::TooLarge => "too-large".to_owned(),
                    halonic_device_keys::SavedTextError::Failed(error) => described(error),
                })
            })
            .await;
    }
    #[cfg(not(target_os = "android"))]
    let _ = (webview, computer, text);
    Err(UNAVAILABLE.to_owned())
}

/// Deletes what is saved for `computer`.
#[tauri::command]
pub async fn phone_saved_clear<R: Runtime>(
    webview: Webview<R>,
    computer: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    if let Some(saved) = android::Saved::for_page(&webview) {
        return saved
            .call(computer, |store, id| store.clear(id).map_err(described))
            .await;
    }
    #[cfg(not(target_os = "android"))]
    let _ = (webview, computer);
    Err(UNAVAILABLE.to_owned())
}

/// An error as the page reads it; it never holds the saved text.
#[cfg(target_os = "android")]
fn described(error: halonic_device_keys::DeviceKeyError) -> String {
    error.to_string()
}

#[cfg(target_os = "android")]
mod android {
    use std::sync::PoisonError;

    use halonic_device_keys::{ComputerId, SavedTextStore};
    use tauri::{AppHandle, Manager, Runtime, Webview};

    use super::UNAVAILABLE;
    use crate::device_keys::{AndroidKeystore, SavedTexts};
    use crate::phone_tunnel_events::on_app_page;

    type Store<R> = SavedTextStore<AndroidKeystore<R>>;

    /// The store, for a call from the app's own page only.
    pub struct Saved<R: Runtime>(AppHandle<R>);

    impl<R: Runtime> Saved<R> {
        pub fn for_page(webview: &Webview<R>) -> Option<Self> {
            on_app_page(webview).then(|| Self(webview.app_handle().clone()))
        }

        /// Runs `work` on the store for `computer`, on a blocking thread,
        /// while no other call runs.
        pub async fn call<T: Send + 'static>(
            self,
            computer: String,
            work: impl FnOnce(&Store<R>, &ComputerId) -> Result<T, String> + Send + 'static,
        ) -> Result<T, String> {
            let id = ComputerId::parse(&computer).map_err(|error| error.to_string())?;
            let app = self.0;
            tauri::async_runtime::spawn_blocking(move || {
                let saved = app.try_state::<SavedTexts<R>>().ok_or(UNAVAILABLE)?;
                // The store keeps nothing in memory, so a panic in another
                // call leaves nothing half done to guard against.
                let store = saved.0.lock().unwrap_or_else(PoisonError::into_inner);
                work(&store, &id)
            })
            .await
            .map_err(|_| UNAVAILABLE.to_owned())?
        }
    }

    /// Deletes what is saved for `computer`, as on Forget and Removed, on a
    /// blocking thread: a write still under way holds the lock while the
    /// Keystore seals, and the caller (the tunnel) mustn't wait for it. A
    /// failure is logged; the page's own Forget asks again.
    pub fn clear<R: Runtime>(app: &AppHandle<R>, computer: &ComputerId) {
        let app = app.clone();
        let computer = computer.clone();
        // Nothing waits for it: the clear runs on its own.
        let detached = tauri::async_runtime::spawn_blocking(move || {
            let Some(saved) = app.try_state::<SavedTexts<R>>() else {
                return;
            };
            let store = saved.0.lock().unwrap_or_else(PoisonError::into_inner);
            if let Err(problem) = store.clear(&computer) {
                halonic_shell_log::record("saved-messaging", &format!("clear failed: {problem}"));
            }
        });
        drop(detached);
    }
}

#[cfg(target_os = "android")]
pub use android::clear;
