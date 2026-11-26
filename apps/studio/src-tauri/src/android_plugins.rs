//! The phone's own plugins, registered in this order by `shell` on Android.
//! Each is driven from Rust: no capability grants a plugin's own commands,
//! so no page can call them.

use tauri::{Builder, Runtime};

/// Registers the phone's plugins on `builder`.
pub(crate) fn register<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    // Asked from Rust only, for Android's local network permission: no
    // capability grants its command, so no page can call it.
    let builder = builder.plugin(crate::local_network::plugin());
    // The pairing scanner's camera, driven from Rust with fixed options: the
    // connect page gets only `pair_scan` and `pair_scan_cancel`.
    let builder = builder.plugin(crate::pair_scan::plugin());
    // The phone's key for each paired computer, sealed by the Android
    // Keystore. Used from Rust only: no capability grants its commands.
    let builder = builder.plugin(crate::device_keys::plugin());
    // The owner check before the phone answers an approval (HAL-15194):
    // Android's own biometric prompt. Used from Rust only: no capability
    // grants its commands, so no page can call it or pick its words. The
    // phone's own page only asks whether it can ask (`owner_check_available`).
    let builder = builder.plugin(crate::owner_check::plugin());
    // Android's settings page for the app and the Tailscale app, which the
    // connect page opens only through `phone_open_settings` and
    // `phone_open_tailscale`: no capability grants the plugin's commands.
    let builder = builder.plugin(crate::phone_screens::plugin());
    // The icon's shortcuts (HAL-19143), which the connect page reaches only
    // through the `phone_*` commands in `app_shortcuts`.
    let builder = builder.plugin(crate::app_shortcuts::plugin());
    // The phone tunnel, over the key store above, so registered after it.
    let builder = builder.plugin(crate::phone_tunnel::plugin());
    // The typed route's computer picker searches the Wi-Fi with Android's
    // NsdManager (HAL-16824). Used from Rust only: no capability grants its
    // commands; the page gets `phone_nearby_browse` and `phone_nearby_stop`.
    builder.plugin(crate::phone_nearby::plugin())
}
