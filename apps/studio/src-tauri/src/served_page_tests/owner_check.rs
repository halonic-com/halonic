//! The served page and the phone's owner check: no page may ask for the
//! biometric prompt or read its status, from any address.

use serde_json::json;

use super::{CONNECT_PAGE, SERVED_PAGE, app_window, invoke};

#[test]
fn no_page_may_call_the_owner_check() {
    // Only the shell asks for the owner check, from Rust, with the prompt's
    // words fixed there (HAL-15194). The plugin is registered on Android
    // only, but the ACL refuses its commands anywhere.
    let window = app_window();
    for from in [CONNECT_PAGE, SERVED_PAGE] {
        for command in [
            "plugin:owner-check|owner_check_status",
            "plugin:owner-check|ownerCheckStatus",
            "plugin:owner-check|confirm_owner",
            "plugin:owner-check|confirmOwner",
        ] {
            assert!(
                invoke(
                    &window,
                    from,
                    command,
                    json!({ "title": "t", "description": "d", "cancel": "c" })
                )
                .is_err(),
                "{command} must be refused from {from}"
            );
        }
    }
}
