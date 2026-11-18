//! The pairing codes, checked against the test vectors `@halonicjs/ports`
//! shares with this crate (`packages/core/ports/src/golden/pairing-vectors.json`).

use halonic_tunnel::{CheckCode, PairingCode, check_code, check_code_from_bytes, pair_commit};
use serde_json::Value;

const VECTORS: &str =
    include_str!("../../../../../../packages/core/ports/src/golden/pairing-vectors.json");

fn vectors(group: &str) -> Vec<Value> {
    let all: Value = serde_json::from_str(VECTORS).expect("the vectors are JSON");
    all[group].as_array().expect("a list of vectors").clone()
}

fn text<'a>(vector: &'a Value, field: &str) -> &'a str {
    vector[field].as_str().expect("a text field")
}

fn hex(text: &str) -> Vec<u8> {
    (0..text.len())
        .step_by(2)
        .map(|at| u8::from_str_radix(&text[at..at + 2], 16).expect("hex"))
        .collect()
}

#[test]
fn pairing_codes_give_the_shared_psk() {
    let cases = vectors("pairingCodes");
    assert_eq!(cases.len(), 3);
    for case in cases {
        let code = PairingCode::parse(text(&case, "code")).expect("a plain code");
        assert_eq!(code.psk().to_vec(), hex(text(&case, "psk")), "{case}");
    }
}

#[test]
fn pairing_codes_give_the_shared_check_codes() {
    let cases = vectors("checkCodes");
    assert_eq!(cases.len(), 5);
    for case in cases {
        let bytes: [u8; 8] = hex(text(&case, "hkdf")).try_into().expect("8 bytes");
        let expected = text(&case, "checkCode");
        assert_eq!(check_code_from_bytes(bytes).as_str(), expected, "{case}");
        // The last two vectors pin the reduction only; they have no hash.
        let hash = hex(text(&case, "handshakeHash"));
        if !hash.is_empty() {
            assert_eq!(check_code(&hash).as_str(), expected, "{case}");
        }
    }
}

#[test]
fn pairing_codes_are_read_only_in_plain_form() {
    assert!(PairingCode::parse("XX7A9Q36KFB3").is_some());
    for refused in [
        "XX7A 9Q36 KFB3",
        "xx7a9q36kfb3",
        "XX7A9Q36KFB",
        "XX7A9Q36KFB33",
        "XX7A9Q36KFB0",
        "",
    ] {
        assert_eq!(PairingCode::parse(refused), None, "{refused:?}");
    }
}

#[test]
fn pairing_codes_stay_out_of_debug_output() {
    let code = PairingCode::parse("XX7A9Q36KFB3").expect("a plain code");
    assert_eq!(format!("{code:?}"), "PairingCode(…)");
}

#[test]
fn pairing_codes_check_code_is_six_symbols() {
    let code: CheckCode = check_code(b"any handshake hash");
    assert_eq!(code.as_str().len(), 6);
}

#[test]
fn pairing_codes_commitment_hashes_label_key_and_payload() {
    let key: [u8; 32] = std::array::from_fn(|index| index as u8 + 1);
    let payload = br#"{"name":"Pixel 9","platform":"android","nonce":"AAAAAAAAAAAAAAAAAAAAAA"}"#;
    // SHA-256 of "halonic pair commit v1", the key and the payload, worked
    // out apart from this crate.
    let expected = hex("a4862a08780fb8cdc630197e4926d4a50f59bf3d7311c22d2d850688300bbc9c");
    assert_eq!(pair_commit(&key, payload).to_vec(), expected);
    assert_ne!(pair_commit(&key, b"{}").to_vec(), expected);
}
