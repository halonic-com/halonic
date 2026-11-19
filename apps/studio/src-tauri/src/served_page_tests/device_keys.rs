//! The served page and the phone's device key store: no page may seal or
//! open a device key, from any address.

use serde_json::json;

use super::{CONNECT_PAGE, SERVED_PAGE, app_window, invoke};

#[test]
fn no_page_may_seal_or_open_a_device_key() {
    // Only the shell uses the phone's key store, from Rust (HAL-12245). The
    // plugin is registered on Android only, but the ACL refuses its
    // commands anywhere.
    let window = app_window();
    for from in [CONNECT_PAGE, SERVED_PAGE] {
        for command in [
            "plugin:device-keys|seal_device_key",
            "plugin:device-keys|sealDeviceKey",
            "plugin:device-keys|open_device_key",
            "plugin:device-keys|openDeviceKey",
        ] {
            assert!(
                invoke(&window, from, command, json!({})).is_err(),
                "{command} must be refused from {from}"
            );
        }
    }
}
