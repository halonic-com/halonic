//! The served page and Android's local network permission (HAL-12253):
//! only the shell asks for it, from Rust, before `connect` and the computer
//! picker's `phone_nearby_browse` (HAL-16824) reach the Wi-Fi, so no page
//! may call the plugin that asks.

use serde_json::json;

use super::{CONNECT_PAGE, SERVED_PAGE, app_window, invoke};

#[test]
fn no_page_may_ask_for_the_local_network_permission() {
    // Only the shell's `connect` asks, from Rust (HAL-12253). The plugin is
    // registered on Android only, but the ACL refuses its command anywhere.
    let window = app_window();
    for from in [CONNECT_PAGE, SERVED_PAGE] {
        for command in [
            "plugin:local-network|allow_local_network",
            "plugin:local-network|allowLocalNetwork",
            "plugin:local-network|request_permissions",
        ] {
            assert!(
                invoke(&window, from, command, json!({})).is_err(),
                "{command} must be refused from {from}"
            );
        }
    }
}
