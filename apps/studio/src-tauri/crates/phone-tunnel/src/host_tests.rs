//! Which endpoints need Android's local network question, and the phone's
//! name as message 3 carries it.

use halonic_tunnel::{Endpoint, MAX_NAME_BYTES};

use crate::host::{needs_local_network, phone_name};

#[test]
fn phone_tunnel_pairing_asks_about_the_local_network_for_the_wi_fi_only() {
    for (endpoint, needs) in [
        ("tcp://192.168.1.20:4100", true),
        ("tcp://10.0.0.5:4100", true),
        ("tcp://desk.local:4100", true),
        ("tcp://DESK.LOCAL:4100", true),
        ("tcp://127.0.0.1:4100", false),
        ("tcp://100.101.102.103:4100", false),
        ("wss://desk.tail1234.ts.net", false),
        ("wss://halonic.example", false),
    ] {
        let endpoint = Endpoint::parse(endpoint).expect(endpoint);
        assert_eq!(needs_local_network(&endpoint), needs, "{endpoint}");
    }
}

#[test]
fn phone_tunnel_pairing_fits_the_phone_s_name_into_message_3() {
    assert_eq!(phone_name("  Tim's Pixel ", "Android phone"), "Tim's Pixel");
    assert_eq!(phone_name("", "Android phone"), "Android phone");
    assert_eq!(phone_name("   ", "Android phone"), "Android phone");
    let long = "é".repeat(MAX_NAME_BYTES);
    let fitted = phone_name(&long, "Android phone");
    assert!(fitted.len() <= MAX_NAME_BYTES);
    assert_eq!(fitted, "é".repeat(MAX_NAME_BYTES / 2));
}
