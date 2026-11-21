//! The phone's owner check (HAL-15194, board decision 4b): the Android
//! adapter of `halonic-owner-check`. Android's own BiometricPrompt, strong
//! biometrics only, through the Kotlin `OwnerCheckPlugin`; no plugin from
//! outside. The shell keeps it as state, and the phone tunnel asks it
//! before it seals each answer to an approval, so a page that skipped its
//! own check still can't answer.
//!
//! No capability grants the plugin's commands, so no page can call them or
//! pick the prompt's words; only the shell does, from Rust, with the words
//! from [`PromptWords`]. A plugin call that fails reads as unavailable, so
//! an error never lets an answer through.

use halonic_owner_check::{Availability, Confirmation, Decision, OwnerCheck, PromptWords};
use serde::{Deserialize, Serialize};
use tauri::plugin::{PluginHandle, TauriPlugin};
use tauri::{Manager, Runtime};

/// Android's BiometricPrompt, as an [`OwnerCheck`].
pub struct AndroidOwnerCheck<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct PromptRequest {
    title: &'static str,
    description: &'static str,
    cancel: &'static str,
}

#[derive(Deserialize)]
struct Status {
    status: String,
}

#[derive(Deserialize)]
struct Answer {
    answer: String,
}

impl<R: Runtime> OwnerCheck for AndroidOwnerCheck<R> {
    async fn availability(&self) -> Availability {
        match self
            .0
            .run_mobile_plugin_async::<Status>("ownerCheckStatus", ())
            .await
        {
            Ok(answer) => Availability::from_plugin(&answer.status),
            Err(_) => Availability::Unavailable,
        }
    }

    async fn confirm(&self, decision: Decision) -> Confirmation {
        let words = PromptWords::for_decision(decision);
        let request = PromptRequest {
            title: words.title,
            description: words.description,
            cancel: words.cancel,
        };
        match self
            .0
            .run_mobile_plugin_async::<Answer>("confirmOwner", request)
            .await
        {
            Ok(answer) => Confirmation::from_plugin(&answer.answer),
            Err(_) => Confirmation::Unavailable(Availability::Unavailable),
        }
    }
}

/// Loads the Kotlin side, which only Android has, and keeps the check as
/// the shell's state.
pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("owner-check")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.halonic.studio", "OwnerCheckPlugin")?;
            app.manage(AndroidOwnerCheck(handle));
            Ok(())
        })
        .build()
}
