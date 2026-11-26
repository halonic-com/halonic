//! The phone's owner check (HAL-15194, board decision 4b): the Android
//! adapter of `halonic-owner-check`. Android's own BiometricPrompt, strong
//! biometrics only, through the Kotlin `OwnerCheckPlugin`; no plugin from
//! outside. For an inbox answer it takes the phone's PIN, pattern or
//! password too (board option P3). The shell keeps it as state, and the
//! phone tunnel asks it before it seals each answer to an approval, and
//! each inbox answer no pass of the last 5 minutes covers, so a page that
//! skipped its own check still can't answer.
//!
//! No capability grants the plugin's commands, so no page can call them or
//! pick the prompt's words; only the shell does, from Rust, with the words
//! from [`PromptWords`]. A plugin call that fails reads as unavailable, so
//! an error never lets an answer through.

use std::time::Duration;

use halonic_owner_check::{Availability, Confirmation, Decision, OwnerCheck, PromptWords};
use serde::{Deserialize, Serialize};
use tauri::plugin::{PluginHandle, TauriPlugin};
use tauri::{Manager, Runtime};

/// How long one prompt may stay open before it reads as cancelled. Long
/// enough to read it and try a finger twice; the person can ask again.
const CONFIRM_TIMEOUT: Duration = Duration::from_secs(120);

/// Android's BiometricPrompt, as an [`OwnerCheck`].
pub struct AndroidOwnerCheck<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PromptRequest {
    title: &'static str,
    description: &'static str,
    cancel: &'static str,
    /// The PIN, pattern or password passes too; decided here from the
    /// decision, never by a page.
    allow_device_credential: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusRequest {
    /// Whether the PIN, pattern or password counts, as for [`PromptRequest`].
    allow_device_credential: bool,
}

#[derive(Deserialize)]
struct Status {
    status: String,
}

#[derive(Deserialize)]
struct Answer {
    answer: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Away {
    times_away: u64,
}

impl<R: Runtime> OwnerCheck for AndroidOwnerCheck<R> {
    async fn availability(&self, decision: Decision) -> Availability {
        let request = StatusRequest {
            allow_device_credential: decision.accepts_device_credential(),
        };
        match self
            .0
            .run_mobile_plugin_async::<Status>("ownerCheckStatus", request)
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
            allow_device_credential: decision.accepts_device_credential(),
        };
        let asking = self
            .0
            .run_mobile_plugin_async::<Answer>("confirmOwner", request);
        // If the Activity goes while the prompt is open, nothing answers;
        // without a limit this call would wait for ever.
        match tokio::time::timeout(CONFIRM_TIMEOUT, asking).await {
            Ok(Ok(answer)) => Confirmation::from_plugin(&answer.answer),
            Ok(Err(_)) => Confirmation::Unavailable(Availability::Unavailable),
            Err(_elapsed) => {
                self.close_prompt().await;
                Confirmation::Cancelled
            }
        }
    }

    async fn times_away(&self) -> Option<u64> {
        // A failed call reads as "can't tell", which keeps no pass.
        self.0
            .run_mobile_plugin_async::<Away>("ownerCheckAway", ())
            .await
            .ok()
            .map(|away| away.times_away)
    }
}

impl<R: Runtime> AndroidOwnerCheck<R> {
    /// Closes a prompt left open past [`CONFIRM_TIMEOUT`], so the next
    /// answer gets its own prompt instead of `busy` (Liam on #4545). The
    /// answer to it no longer counts: this one already reads as cancelled.
    async fn close_prompt(&self) {
        let closing = self
            .0
            .run_mobile_plugin_async::<()>("closeOwnerCheck", ())
            .await;
        if closing.is_err() {
            halonic_shell_log::record("owner-check", "closing a timed-out prompt failed");
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
