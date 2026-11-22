//! Android screens the phone's own page sends the person to (HAL-16438),
//! through the Kotlin `PhoneScreensPlugin`. The connect page gets two
//! commands, on Android only (`capabilities/phone-screens.json`):
//!
//! - `phone_open_settings` opens Android's settings page for Halonic, where
//!   the person turns on the camera or "Nearby devices".
//! - `phone_open_tailscale` opens the Tailscale app, or its Play Store page
//!   when it isn't installed.
//!
//! Neither takes anything from the page, so the page can't pick another
//! screen, app or address. Each answers whether the screen opened, and
//! answers false, opening nothing, while the window isn't on the app's own
//! page. No capability grants the plugin's own commands.

use tauri::{Runtime, Webview};

use crate::phone_tunnel_events::on_app_page;

/// Opens Android's settings page for this app.
#[tauri::command]
pub async fn phone_open_settings<R: Runtime>(webview: Webview<R>) -> bool {
    open(&webview, "openAppSettings").await
}

/// Opens the Tailscale app, or its Play Store page.
#[tauri::command]
pub async fn phone_open_tailscale<R: Runtime>(webview: Webview<R>) -> bool {
    open(&webview, "openTailscale").await
}

/// Runs one of the Kotlin plugin's commands, only while the window is on
/// the app's own page. A plugin call that fails reads as not opened.
pub async fn open<R: Runtime>(webview: &Webview<R>, screen: &'static str) -> bool {
    // The capability keeps the served Studio out; this keeps a page the
    // window has since left out too, as for `tunnel_send`.
    if !on_app_page(webview) {
        return false;
    }
    #[cfg(target_os = "android")]
    {
        if let Some(screens) = android::screens(webview.app_handle()) {
            return screens.open(screen).await;
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = screen;
    false
}

#[cfg(target_os = "android")]
mod android {
    use serde::Deserialize;
    use tauri::plugin::{PluginHandle, TauriPlugin};
    use tauri::{AppHandle, Manager, Runtime, State};

    pub struct Screens<R: Runtime>(PluginHandle<R>);

    /// The Kotlin plugin's answer.
    #[derive(Deserialize)]
    struct Answer {
        opened: bool,
    }

    impl<R: Runtime> Screens<R> {
        pub async fn open(&self, screen: &'static str) -> bool {
            self.0
                .run_mobile_plugin_async::<Answer>(screen, ())
                .await
                .is_ok_and(|answer| answer.opened)
        }
    }

    pub fn screens<R: Runtime>(app: &AppHandle<R>) -> Option<State<'_, Screens<R>>> {
        app.try_state::<Screens<R>>()
    }

    /// Loads the Kotlin side, which only Android has.
    pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
        tauri::plugin::Builder::new("phone-screens")
            .setup(|app, api| {
                let handle =
                    api.register_android_plugin("com.halonic.studio", "PhoneScreensPlugin")?;
                app.manage(Screens(handle));
                Ok(())
            })
            .build()
    }
}

#[cfg(target_os = "android")]
pub use android::plugin;
