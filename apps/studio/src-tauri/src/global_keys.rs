//! The global-shortcut plugin (HAL-18778), which the feedback shortcut
//! and quick ask (HAL-18787) share. It is registered from Rust only, and
//! only with their own keys: no capability grants the plugin's commands, so
//! no page can register a key or hear one. A press goes to whichever of
//! the two registered its keys; any other press does nothing.

use tauri::{AppHandle, Builder, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcut, ShortcutState};

/// The global-shortcut plugin, handing each press to its owner. Left out
/// on Linux without an X display, which has no global keys: the plugin
/// would stop Studio starting.
pub fn keys<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    if cfg!(target_os = "linux") && std::env::var_os("DISPLAY").is_none() {
        return builder;
    }
    builder.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }
                if crate::quick_ask::owns(app, shortcut) {
                    crate::quick_ask::pressed(app);
                } else if crate::feedback_capture::owns(app, shortcut) {
                    crate::feedback_capture::pressed(app);
                }
            })
            .build(),
    )
}

/// The global-shortcut plugin, when Studio started with it.
pub fn shortcuts<R: Runtime>(app: &AppHandle<R>) -> Option<&GlobalShortcut<R>> {
    app.try_state::<GlobalShortcut<R>>()
        .map(|state| state.inner())
}
