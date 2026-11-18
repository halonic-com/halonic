//! Android's local network permission (HAL-12253). From Android 17 the app
//! can't reach an address on the Wi-Fi until the user allows "Nearby
//! devices", and a blocked call only times out. The `connect` command asks
//! here first, through the Kotlin `LocalNetworkPlugin`. No capability grants
//! the plugin's command, so no page can call it; only the shell does, from
//! Rust. Other platforms never block, so they always answer yes.

use tauri::{AppHandle, Runtime};

#[cfg(target_os = "android")]
mod android {
    use serde::Deserialize;
    use tauri::plugin::{PluginHandle, TauriPlugin};
    use tauri::{Manager, Runtime};

    pub struct LocalNetwork<R: Runtime>(pub PluginHandle<R>);

    /// The Kotlin plugin's answer.
    #[derive(Deserialize)]
    pub struct Answer {
        pub granted: bool,
    }

    /// Loads the Kotlin side, which only Android has.
    pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
        tauri::plugin::Builder::new("local-network")
            .setup(|app, api| {
                let handle =
                    api.register_android_plugin("com.halonic.studio", "LocalNetworkPlugin")?;
                app.manage(LocalNetwork(handle));
                Ok(())
            })
            .build()
    }
}

#[cfg(target_os = "android")]
pub use android::plugin;

/// Whether the app may reach the local network, asking the user first with
/// Android's own question when they haven't answered it yet. A plugin that
/// fails reads as "no", so the page says why instead of timing out.
#[cfg(target_os = "android")]
pub async fn allowed<R: Runtime>(app: &AppHandle<R>) -> bool {
    use tauri::Manager;
    let Some(plugin) = app.try_state::<android::LocalNetwork<R>>() else {
        return false;
    };
    plugin
        .0
        .run_mobile_plugin_async::<android::Answer>("allowLocalNetwork", ())
        .await
        .is_ok_and(|answer| answer.granted)
}

#[cfg(not(target_os = "android"))]
pub async fn allowed<R: Runtime>(_app: &AppHandle<R>) -> bool {
    true
}
