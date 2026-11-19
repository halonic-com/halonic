//! The served page and the phone's pairing scanner (HAL-12246): only the
//! phone's own page may open or close the scanner, and no page may reach the
//! barcode-scanner plugin's own commands.

use serde_json::{Value, json};

use super::{CONNECT_PAGE, SERVED_PAGE, app_window, invoke};

#[test]
fn no_page_may_call_the_barcode_scanner_plugin() {
    // The shell drives the scanner's Kotlin side from Rust (HAL-12246) and
    // never registers the plugin itself, so a page can't pick the camera,
    // the formats or the layout. Only `pair_scan` and `pair_scan_cancel`
    // are granted, and only on Android.
    let window = app_window();
    for from in [CONNECT_PAGE, SERVED_PAGE] {
        for command in [
            "plugin:barcode-scanner|scan",
            "plugin:barcode-scanner|cancel",
            "plugin:barcode-scanner|check_permissions",
            "plugin:barcode-scanner|request_permissions",
            "plugin:barcode-scanner|open_app_settings",
            "plugin:barcode-scanner|vibrate",
            "plugin:pair-scanner|scan",
            "plugin:pair-scanner|cancel",
            "plugin:pair-scanner|requestPermissions",
        ] {
            assert!(
                invoke(&window, from, command, json!({})).is_err(),
                "{command} must be refused from {from}"
            );
        }
    }
}

#[test]
fn served_page_test_sees_the_scanner_granted_to_the_phone_s_own_page_only() {
    // A remote page must never open the camera: the served Studio is the
    // computer's, and pairing must start on the phone's own page.
    let text = include_str!("../../capabilities/phone-pair-scan.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert_eq!(capability["platforms"], json!(["android"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!(["allow-pair-scan", "allow-pair-scan-cancel"])
    );
}

#[cfg(desktop)]
#[test]
fn served_page_test_sees_no_page_allowed_the_scanner_on_desktop() {
    let window = app_window();
    for from in [CONNECT_PAGE, SERVED_PAGE] {
        for command in ["pair_scan", "pair_scan_cancel"] {
            assert!(
                invoke(&window, from, command, json!({})).is_err(),
                "{command} must be refused from {from}"
            );
        }
    }
}
