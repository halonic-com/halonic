//! The Android app's shortcuts (HAL-19143), through the Kotlin
//! `AppShortcutsPlugin`: Inbox and Messenger on a long press of the icon,
//! the last chat opened, and pinning a screen to the home screen. The
//! connect page gets four commands, on Android only
//! (`capabilities/app-shortcuts.json`):
//!
//! - `phone_open_target` answers, once, the screen the last shortcut asked
//!   for, or none;
//! - `phone_last_chat` makes a chat the last-chat shortcut, or removes it;
//! - `phone_can_pin` answers whether the launcher pins shortcuts;
//! - `phone_pin` opens Android's own Add to Home screen for Inbox or
//!   Messenger.
//!
//! A shortcut's intent can come from any app, as the launcher's activity is
//! exported: Kotlin reads only a screen's name from it, and the chat it
//! answers is the one stored here, checked again below. Every command does
//! nothing while the window isn't on the app's own page. No capability
//! grants the plugin's own commands.

use halonic_device_keys::ComputerId;
use serde::{Deserialize, Serialize};
use tauri::{Runtime, Webview};

use crate::phone_tunnel_events::on_app_page;

/// The longest chat id or chat name the shortcut keeps, in bytes.
pub(crate) const MAX_CHAT_TEXT: usize = 200;

/// The screen a shortcut opens, as the page reads it.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "screen", rename_all = "lowercase")]
pub enum OpenTarget {
    Inbox,
    Messenger,
    Chat { computer: String, chat: String },
}

/// A chat for the last-chat shortcut.
#[derive(Debug, Deserialize)]
pub struct LastChat {
    computer: String,
    chat: String,
    name: String,
}

/// The screens a page may pin: no other.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PinScreen {
    Inbox,
    Messenger,
}

/// Kotlin's answer to `takeOpenTarget`.
#[derive(Debug, Deserialize)]
pub(crate) struct Taken {
    target: Option<String>,
    computer: Option<String>,
    chat: Option<String>,
}

/// Whether `text` is fit for a shortcut: not empty, not too long, no
/// control characters.
fn fit(text: &str) -> bool {
    !text.trim().is_empty() && text.len() <= MAX_CHAT_TEXT && !text.chars().any(char::is_control)
}

/// Whether `chat` may become the last-chat shortcut.
pub(crate) fn chat_fits(chat: &LastChat) -> bool {
    ComputerId::parse(&chat.computer).is_ok() && fit(&chat.chat) && fit(&chat.name)
}

/// The screen Kotlin's answer names. A chat that doesn't check out opens
/// the Messenger list, as a chat that's gone does; anything else, none.
pub(crate) fn target_of(taken: Taken) -> Option<OpenTarget> {
    match taken.target.as_deref()? {
        "inbox" => Some(OpenTarget::Inbox),
        "messenger" => Some(OpenTarget::Messenger),
        "chat" => match (taken.computer, taken.chat) {
            (Some(computer), Some(chat)) if ComputerId::parse(&computer).is_ok() && fit(&chat) => {
                Some(OpenTarget::Chat { computer, chat })
            }
            _ => Some(OpenTarget::Messenger),
        },
        _ => None,
    }
}

/// Answers, once, the screen the last shortcut asked for.
#[tauri::command]
pub async fn phone_open_target<R: Runtime>(webview: Webview<R>) -> Option<OpenTarget> {
    if !on_app_page(&webview) {
        return None;
    }
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;

        if let Some(shortcuts) = android::shortcuts(webview.app_handle()) {
            return shortcuts.take().await.and_then(target_of);
        }
    }
    None
}

/// Makes `chat` the last-chat shortcut, or removes it when there's none.
/// Answers false, changing nothing, for a chat that doesn't fit.
#[tauri::command]
pub async fn phone_last_chat<R: Runtime>(webview: Webview<R>, chat: Option<LastChat>) -> bool {
    if !on_app_page(&webview) || chat.as_ref().is_some_and(|chat| !chat_fits(chat)) {
        return false;
    }
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;

        if let Some(shortcuts) = android::shortcuts(webview.app_handle()) {
            return shortcuts.last_chat(chat).await;
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = chat;
    false
}

/// Whether the launcher pins shortcuts.
#[tauri::command]
pub async fn phone_can_pin<R: Runtime>(webview: Webview<R>) -> bool {
    if !on_app_page(&webview) {
        return false;
    }
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;

        if let Some(shortcuts) = android::shortcuts(webview.app_handle()) {
            return shortcuts.can_pin().await;
        }
    }
    false
}

/// Opens Android's Add to Home screen for `screen`. Answers whether it opened.
#[tauri::command]
pub async fn phone_pin<R: Runtime>(webview: Webview<R>, screen: PinScreen) -> bool {
    if !on_app_page(&webview) {
        return false;
    }
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;

        if let Some(shortcuts) = android::shortcuts(webview.app_handle()) {
            return shortcuts.pin(screen).await;
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = screen;
    false
}

#[cfg(target_os = "android")]
mod android {
    use serde::{Deserialize, Serialize};
    use tauri::plugin::{PluginHandle, TauriPlugin};
    use tauri::{AppHandle, Manager, Runtime, State};

    use super::{LastChat, PinScreen, Taken};

    pub struct Shortcuts<R: Runtime>(PluginHandle<R>);

    /// The chat's fields, or none of them to remove the last chat.
    #[derive(Serialize, Default)]
    struct ChatArgs<'a> {
        #[serde(skip_serializing_if = "Option::is_none")]
        computer: Option<&'a str>,
        #[serde(skip_serializing_if = "Option::is_none")]
        chat: Option<&'a str>,
        #[serde(skip_serializing_if = "Option::is_none")]
        name: Option<&'a str>,
    }

    #[derive(Serialize)]
    struct PinArgs {
        target: &'static str,
    }

    #[derive(Deserialize)]
    struct Pinnable {
        pinnable: bool,
    }

    #[derive(Deserialize)]
    struct Asked {
        asked: bool,
    }

    impl<R: Runtime> Shortcuts<R> {
        pub async fn take(&self) -> Option<Taken> {
            self.0
                .run_mobile_plugin_async::<Taken>("takeOpenTarget", ())
                .await
                .ok()
        }

        pub async fn last_chat(&self, chat: Option<LastChat>) -> bool {
            let args = chat
                .as_ref()
                .map_or_else(ChatArgs::default, |chat| ChatArgs {
                    computer: Some(&chat.computer),
                    chat: Some(&chat.chat),
                    name: Some(&chat.name),
                });
            self.0
                .run_mobile_plugin_async::<serde_json::Value>("setLastChat", args)
                .await
                .is_ok()
        }

        pub async fn can_pin(&self) -> bool {
            self.0
                .run_mobile_plugin_async::<Pinnable>("canPin", ())
                .await
                .is_ok_and(|answer| answer.pinnable)
        }

        pub async fn pin(&self, screen: PinScreen) -> bool {
            let target = match screen {
                PinScreen::Inbox => "inbox",
                PinScreen::Messenger => "messenger",
            };
            self.0
                .run_mobile_plugin_async::<Asked>("pin", PinArgs { target })
                .await
                .is_ok_and(|answer| answer.asked)
        }
    }

    pub fn shortcuts<R: Runtime>(app: &AppHandle<R>) -> Option<State<'_, Shortcuts<R>>> {
        app.try_state::<Shortcuts<R>>()
    }

    /// Loads the Kotlin side, which only Android has.
    pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
        tauri::plugin::Builder::new("app-shortcuts")
            .setup(|app, api| {
                let handle =
                    api.register_android_plugin("com.halonic.studio", "AppShortcutsPlugin")?;
                app.manage(Shortcuts(handle));
                Ok(())
            })
            .build()
    }
}

#[cfg(target_os = "android")]
pub use android::plugin;

#[cfg(test)]
#[path = "app_shortcuts_tests.rs"]
mod tests;
