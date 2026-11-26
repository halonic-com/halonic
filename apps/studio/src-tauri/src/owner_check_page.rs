//! Whether the phone's owner check can ask now, for the phone's own page
//! (HAL-15194, PR 3b; per decision since HAL-19060). The page shows Approve
//! and Reject for a risky approval only when `approval` is `true`, and the
//! Inbox card's answers only when `answer` is; it asks again every time the
//! list of approvals arrives, because a fingerprint or a screen lock can be
//! removed at any time (`capabilities/phone-owner-check.json` grants it on
//! Android only).
//!
//! It answers two plain booleans and nothing else: not which biometric is
//! enrolled, nor why the check can't ask. An approval takes a strong
//! biometric only, an Inbox answer the phone's PIN, pattern or password too
//! (`Decision::accepts_device_credential`), so a phone with only a PIN
//! answers `answer: true` and `approval: false`. It fails closed: an error,
//! an Android older than 11, a window on another page and every desktop all
//! answer `false` for both.
//!
//! This is only a hint for the page. The phone tunnel still asks the owner
//! check before it seals each answer (`tunnel_send`), so a page that showed
//! the buttons anyway still can't answer without a pass.

use halonic_owner_check::{Decision, OwnerCheck};
use serde::Serialize;
use tauri::{Runtime, Webview};

use crate::phone_tunnel_events::on_app_page;

/// Whether the owner check can ask now, for each kind of answer.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct OwnerCheckReady {
    /// For an answer to an approval: a strong biometric is enrolled.
    pub approval: bool,
    /// For an Inbox answer: a strong biometric or a screen lock is set.
    pub answer: bool,
}

/// Whether the owner check can ask now, for approvals and for Inbox answers.
#[tauri::command]
pub async fn owner_check_available<R: Runtime>(webview: Webview<R>) -> OwnerCheckReady {
    available(&webview).await
}

pub(crate) async fn available<R: Runtime>(webview: &Webview<R>) -> OwnerCheckReady {
    // The capability keeps the served Studio out; this keeps a page the
    // window has since left out too, as for `tunnel_send`.
    if !on_app_page(webview) {
        return OwnerCheckReady::default();
    }
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;

        use crate::owner_check::AndroidOwnerCheck;

        if let Some(check) = webview.app_handle().try_state::<AndroidOwnerCheck<R>>() {
            return ready_with(check.inner()).await;
        }
    }
    OwnerCheckReady::default()
}

/// Asks `check` once per kind of answer. `Availability::from_plugin` reads
/// every status it doesn't know, and a failed plugin call, as unavailable.
#[cfg_attr(not(any(target_os = "android", test)), expect(dead_code))]
pub(crate) async fn ready_with<C: OwnerCheck>(check: &C) -> OwnerCheckReady {
    OwnerCheckReady {
        approval: check.availability(Decision::Approve).await.is_ready(),
        answer: check.availability(Decision::Answer).await.is_ready(),
    }
}

#[cfg(test)]
#[path = "owner_check_page_tests.rs"]
mod tests;
