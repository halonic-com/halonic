//! How a pairing start from the page is read and checked.

use halonic_blob_store::base64url;
use halonic_device_keys::ComputerId;
use halonic_tunnel::{Endpoint, PairingRoute};
use serde_json::{Value, json};

use crate::answers::Problem;
use crate::start::{CheckedStart, PairingStart};
use crate::status::Reason;

const CODE: &str = "XX7A9Q36KFB3";

fn check(start: Value) -> Result<CheckedStart, Problem> {
    serde_json::from_value::<PairingStart>(start)
        .expect("a start the page sends")
        .check()
}

#[test]
fn phone_tunnel_pairing_reads_a_qr_start() {
    let host_key = [9u8; 32];
    let checked = check(json!({
        "route": "qr",
        "hostKey": base64url::encode(&host_key),
        "code": CODE,
        "endpoints": ["tcp://192.168.1.20:4100", "wss://desk.tail1234.ts.net"],
    }))
    .expect("a QR start");
    assert_eq!(checked.route, PairingRoute::Qr { host_key });
    assert_eq!(
        checked.endpoints,
        vec![
            Endpoint::parse("tcp://192.168.1.20:4100").unwrap(),
            Endpoint::parse("wss://desk.tail1234.ts.net").unwrap(),
        ]
    );
    assert_eq!(checked.again, None);
}

#[test]
fn phone_tunnel_pairing_reads_a_typed_start_to_pair_again() {
    let checked = check(json!({
        "route": "typed",
        "code": CODE,
        "endpoints": ["tcp://192.168.1.20:4100"],
        "again": "desk",
    }))
    .expect("a typed start");
    assert_eq!(checked.route, PairingRoute::Typed);
    assert_eq!(checked.again, Some(ComputerId::parse("desk").unwrap()));

    // An id that isn't one is a new pairing.
    let checked = check(json!({
        "route": "typed",
        "code": CODE,
        "endpoints": ["tcp://192.168.1.20:4100"],
        "again": "../desk",
    }))
    .expect("a typed start");
    assert_eq!(checked.again, None);
}

#[test]
fn phone_tunnel_pairing_refuses_a_code_or_key_that_does_not_read() {
    for code in [
        "XX7A9Q36KFB",
        "xx7a9q36kfb3",
        "XX7A-9Q36-KFB3",
        "XX7A9Q36KFB0",
    ] {
        let refused = check(json!({ "route": "typed", "code": code, "endpoints": ["tcp://h:1"] }));
        assert_eq!(refused.err(), Some(Problem::Unreadable), "{code}");
    }
    for host_key in [base64url::encode(&[9u8; 31]), "not base64url!".to_owned()] {
        let refused = check(json!({
            "route": "qr",
            "hostKey": host_key,
            "code": CODE,
            "endpoints": ["tcp://h:1"],
        }));
        assert_eq!(refused.err(), Some(Problem::Unreadable));
    }
}

#[test]
fn phone_tunnel_pairing_leaves_out_endpoints_that_do_not_read() {
    let checked = check(json!({
        "route": "typed",
        "code": CODE,
        "endpoints": ["http://192.168.1.20:4100", "tcp://192.168.1.20:4100", "junk"],
    }))
    .expect("one endpoint reads");
    assert_eq!(
        checked.endpoints,
        vec![Endpoint::parse("tcp://192.168.1.20:4100").unwrap()]
    );
    for endpoints in [json!([]), json!(["192.168.1.20", "ws://h:1", "tcp://h"])] {
        let refused = check(json!({ "route": "typed", "code": CODE, "endpoints": endpoints }));
        assert_eq!(
            refused.err(),
            Some(Problem::CantReach {
                reason: Reason::Unreachable
            })
        );
    }
}
