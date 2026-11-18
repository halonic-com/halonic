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
    #[serde(rename_all = "camelCase")]
    pub struct Answer {
        pub granted: bool,
        #[serde(default)]
        pub ask_again: bool,
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

/// The user's answer to Android's local network question.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Answer {
    Allowed,
    /// Turned down. `ask_again` says whether Android will show its question
    /// on the next press; when it won't, only the phone's Settings can turn
    /// the permission on. Only Android builds it.
    #[cfg_attr(not(target_os = "android"), expect(dead_code))]
    TurnedDown {
        ask_again: bool,
    },
}

/// Whether the app may reach the local network, asking the user first with
/// Android's own question when they haven't answered it yet. A plugin that
/// fails reads as "no, and won't ask again", so the page says why instead
/// of timing out, and points to Settings when it can't tell.
#[cfg(target_os = "android")]
pub async fn allowed<R: Runtime>(app: &AppHandle<R>) -> Answer {
    use tauri::Manager;
    let turned_down = Answer::TurnedDown { ask_again: false };
    let Some(plugin) = app.try_state::<android::LocalNetwork<R>>() else {
        return turned_down;
    };
    match plugin
        .0
        .run_mobile_plugin_async::<android::Answer>("allowLocalNetwork", ())
        .await
    {
        Ok(answer) if answer.granted => Answer::Allowed,
        Ok(answer) => Answer::TurnedDown {
            ask_again: answer.ask_again,
        },
        Err(_) => turned_down,
    }
}

#[cfg(not(target_os = "android"))]
pub async fn allowed<R: Runtime>(_app: &AppHandle<R>) -> Answer {
    Answer::Allowed
}
