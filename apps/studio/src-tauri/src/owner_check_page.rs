//! Whether the phone's owner check can ask now, for the phone's own page
//! (HAL-15194, PR 3b). The page shows Approve and Reject for a risky
//! approval only when this answers `true`; it asks again every time the
//! list of approvals arrives, because a fingerprint can be removed at any
//! time (`capabilities/phone-owner-check.json` grants it on Android only).
//!
//! It answers a plain boolean and nothing else: not which biometric is
//! enrolled, nor why the check can't ask. It fails closed: an error, an
//! Android older than 11, a weak or missing biometric, a window on another
//! page and every desktop all answer `false`.
//!
//! This is only a hint for the page. The phone tunnel still asks the owner
//! check before it seals each answer (`tunnel_send`), so a page that showed
//! the buttons anyway still can't answer without a pass.

use tauri::{Runtime, Webview};

use crate::phone_tunnel_events::on_app_page;

/// Whether a strong biometric is enrolled and can be asked for now.
#[tauri::command]
pub async fn owner_check_available<R: Runtime>(webview: Webview<R>) -> bool {
    available(&webview).await
}

pub(crate) async fn available<R: Runtime>(webview: &Webview<R>) -> bool {
    // The capability keeps the served Studio out; this keeps a page the
    // window has since left out too, as for `tunnel_send`.
    if !on_app_page(webview) {
        return false;
    }
    #[cfg(target_os = "android")]
    {
        use halonic_owner_check::OwnerCheck;
        use tauri::Manager;

        use crate::owner_check::AndroidOwnerCheck;

        // `Availability::from_plugin` reads every status it doesn't know,
        // and a failed plugin call, as unavailable.
        if let Some(check) = webview.app_handle().try_state::<AndroidOwnerCheck<R>>() {
            return check.availability().await.is_ready();
        }
    }
    false
}
