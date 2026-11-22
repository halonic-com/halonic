//! The phone tunnel's commands (tunnel D6, HAL-15157): the phone's own
//! page pairs with a computer, lists, forgets, connects to and disconnects
//! from paired computers through these, and the `halonic-phone-tunnel`
//! crate does the work. Android only (`capabilities/phone-tunnel.json`, a
//! local capability), so the Studio a computer serves gets none of them.
//!
//! The keys stay in Rust: every answer is one of the crate's typed answers,
//! with the check code, computer names, ids, endpoints, times and states,
//! never a private key, a session key, the pairing code or its psk. The
//! statuses go to the page on the channel `phone_tunnel_watch` takes, only
//! while the window is on the app's own page (`phone_tunnel_events`).
//!
//! The commands that wait run on async threads, never Android's main
//! thread, since the key store waits for the Android Keystore. Other
//! platforms have no tunnel: their commands answer `keys-unavailable`, and
//! no capability grants them there.

use halonic_phone_tunnel::{
    ComputersAnswer, ConnectOutcome, ForgetOutcome, PairingOutcome, PairingStart, PairingStep,
    Problem,
};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, Webview};

use crate::phone_tunnel_events::{self, TunnelEvent};

/// The answer when this build has no tunnel.
const NO_TUNNEL: Problem = Problem::KeysUnavailable;

/// Starts a pairing, ending any other, and answers at the check code.
#[tauri::command]
pub async fn phone_pair_start<R: Runtime>(app: AppHandle<R>, start: PairingStart) -> PairingStep {
    #[cfg(target_os = "android")]
    {
        if let Some(tunnel) = android::tunnel(&app) {
            return tunnel.pair_start(start).await;
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = (app, start);
    PairingStep::Stopped(NO_TUNNEL)
}

/// Waits for the computer's Allow on the pairing at its check code.
#[tauri::command]
pub async fn phone_pair_wait<R: Runtime>(app: AppHandle<R>) -> PairingOutcome {
    #[cfg(target_os = "android")]
    {
        if let Some(tunnel) = android::tunnel(&app) {
            return tunnel.pair_wait().await;
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = app;
    PairingOutcome::Stopped(NO_TUNNEL)
}

/// Ends the pairing in progress: the person left the check code screen.
#[tauri::command]
pub fn phone_pair_cancel<R: Runtime>(app: AppHandle<R>) {
    end_pairing(&app);
}

/// The paired computers, Removed ones included.
#[tauri::command]
pub async fn phone_computers<R: Runtime>(app: AppHandle<R>) -> ComputersAnswer {
    #[cfg(target_os = "android")]
    {
        if let Some(tunnel) = android::tunnel(&app) {
            return tunnel.computers().await;
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = app;
    ComputersAnswer::Stopped(NO_TUNNEL)
}

/// Forgets a computer: its connection, its key and its details.
#[tauri::command]
pub async fn phone_forget<R: Runtime>(app: AppHandle<R>, computer: String) -> ForgetOutcome {
    #[cfg(target_os = "android")]
    {
        if let Some(tunnel) = android::tunnel(&app) {
            return tunnel.forget(&computer).await;
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = (app, computer);
    ForgetOutcome::Stopped(NO_TUNNEL)
}

/// Connects to a paired computer, or makes one that waits to reconnect
/// try at once. The status follows on the page's channel.
#[tauri::command]
pub async fn phone_connect<R: Runtime>(app: AppHandle<R>, computer: String) -> ConnectOutcome {
    #[cfg(target_os = "android")]
    {
        if let Some(tunnel) = android::tunnel(&app) {
            return tunnel.connect(&computer).await;
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = (app, computer);
    ConnectOutcome::Stopped(NO_TUNNEL)
}

/// Ends the connection to a computer, which stays paired.
#[tauri::command]
pub fn phone_disconnect<R: Runtime>(app: AppHandle<R>, computer: String) {
    #[cfg(target_os = "android")]
    {
        if let Some(tunnel) = android::tunnel(&app) {
            tunnel.disconnect(&computer);
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = (app, computer);
}

/// Sends each computer's current status, then every change, on
/// `on_event`, until the page leaves the app's own page, reloads or
/// closes. Answers false, and sends nothing, unless the window is on the
/// app's own page.
#[tauri::command]
pub fn phone_tunnel_watch<R: Runtime>(webview: Webview<R>, on_event: Channel<TunnelEvent>) -> bool {
    let current = current_statuses(webview.app_handle());
    phone_tunnel_events::watch(&webview, on_event, current)
}

/// Ends what a page had going when it starts loading another page or
/// closes: its pairing, which it can no longer show, and its channels.
/// Connections keep running; a page that watches again gets their status.
pub fn end_page<R: Runtime>(app: &AppHandle<R>, label: &str) {
    end_pairing(app);
    phone_tunnel_events::end_page_watch(app, label);
}

fn end_pairing<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(target_os = "android")]
    {
        if let Some(tunnel) = android::tunnel(app) {
            tunnel.pair_cancel();
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = app;
}

/// Each computer's latest status, as events.
fn current_statuses<R: Runtime>(app: &AppHandle<R>) -> Vec<TunnelEvent> {
    #[cfg(target_os = "android")]
    {
        if let Some(tunnel) = android::tunnel(app) {
            return tunnel
                .statuses()
                .into_iter()
                .map(|(computer, status)| TunnelEvent::Status {
                    computer: computer.as_str().to_owned(),
                    status,
                })
                .collect();
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = app;
    Vec::new()
}

#[cfg(target_os = "android")]
mod android {
    use std::sync::Arc;

    use halonic_device_keys::{ComputerId, PairedComputers};
    use halonic_phone_tunnel::{
        LocalNetwork, LocalNetworkAnswer, Options, PageStatus, PhoneAnswer, PhoneTunnel,
        TunnelHost, phone_name,
    };
    use halonic_tunnel::{Dialer, PhoneDetails, Platform};
    use serde::Deserialize;
    use tauri::plugin::{PluginHandle, TauriPlugin};
    use tauri::{AppHandle, Manager, Runtime, State};

    use crate::device_keys::{DeviceKeys, key_store};
    use crate::local_network::Answer;
    use crate::phone_tunnel_events::{TunnelEvent, tell};

    /// The folder in the app's data that holds the paired computers'
    /// details, next to their sealed keys.
    const COMPUTERS_FOLDER: &str = "paired-computers";

    pub type Tunnel<R> = PhoneTunnel<DeviceKeys<R>>;

    pub fn tunnel<R: Runtime>(app: &AppHandle<R>) -> Option<State<'_, Tunnel<R>>> {
        app.try_state::<Tunnel<R>>()
    }

    /// Loads the Kotlin side of the phone's name and keeps the tunnel as
    /// the shell's state. Registered after the device key store, whose
    /// Keystore it uses.
    pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
        tauri::plugin::Builder::new("phone-tunnel")
            .setup(|app, api| {
                let names = api.register_android_plugin("com.halonic.studio", "PhoneNamePlugin")?;
                let keys = key_store(app).ok_or("the device key store isn't set up")?;
                let data = app.path().app_data_dir()?;
                let computers = PairedComputers::new(data.join(COMPUTERS_FOLDER), keys);
                let host = ShellHost {
                    app: app.clone(),
                    names,
                };
                // TLS endpoints (`wss:`, Tailscale) need a rustls config with
                // the platform verifier, which comes with its own task; until
                // then they can't be reached, and `tcp:` ones on the Wi-Fi can.
                let dialer = Dialer::without_tls();
                app.manage::<Tunnel<R>>(PhoneTunnel::new(
                    computers,
                    dialer,
                    Arc::new(host),
                    Options::DEFAULT,
                ));
                Ok(())
            })
            .build()
    }

    /// The Kotlin side's answer to `phoneName`.
    #[derive(Deserialize)]
    struct Named {
        name: String,
    }

    /// The shell, as the tunnel service sees it.
    struct ShellHost<R: Runtime> {
        app: AppHandle<R>,
        names: PluginHandle<R>,
    }

    impl<R: Runtime> TunnelHost for ShellHost<R> {
        fn allow_local_network(&self) -> LocalNetworkAnswer<'_> {
            Box::pin(async move {
                match crate::local_network::allowed(&self.app).await {
                    Answer::Allowed => LocalNetwork::Allowed,
                    Answer::TurnedDown { ask_again } => LocalNetwork::TurnedDown { ask_again },
                }
            })
        }

        fn phone(&self) -> PhoneAnswer<'_> {
            Box::pin(async move {
                let asked = self
                    .names
                    .run_mobile_plugin_async::<Named>("phoneName", ())
                    .await;
                let name = asked.map(|named| named.name).unwrap_or_default();
                PhoneDetails {
                    name: phone_name(&name, "Android phone"),
                    platform: Platform::Android,
                }
            })
        }

        fn status_changed(&self, computer: &ComputerId, status: &PageStatus) {
            let event = TunnelEvent::Status {
                computer: computer.as_str().to_owned(),
                status: *status,
            };
            tell(&self.app, &event);
        }

        // Carried to the page with `tunnel_send` in the next part of D7a
        // (HAL-15177); until then the page can't answer a session, so the
        // shell passes nothing of it on.
        fn session_opened(&self, _computer: &ComputerId, _generation: u64) {}

        fn message(&self, _computer: &ComputerId, _generation: u64, _text: &str) {}

        fn log(&self, line: &str) {
            halonic_shell_log::record("phone-tunnel", line);
        }
    }
}

#[cfg(target_os = "android")]
pub use android::plugin;
