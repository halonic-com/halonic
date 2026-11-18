//! The phone's two handshakes against a fake host built on `snow`.

mod support;

use std::time::Instant;

use halonic_blob_store::base64url;
use halonic_tunnel::{
    FrameKind, Opened, PairRefusedReason, Pairing, PairingCheck, PairingCode, PairingRoute,
    PhoneDetails, PhoneKeys, Platform, Reconnect, SessionError, check_code, pair_commit,
};
use serde_json::{Value, json};
use snow::HandshakeState;
use support::{FakeHost, open, read_handshake, seal, write_handshake};

const CODE: &str = "XX7A9Q36KFB3";

fn phone() -> PhoneDetails {
    PhoneDetails {
        name: "Pixel 9".to_owned(),
        platform: Platform::Android,
    }
}

fn start_pairing(keys: &PhoneKeys, route: PairingRoute) -> (Pairing, Vec<u8>) {
    let code = PairingCode::parse(CODE).expect("a plain code");
    Pairing::start(keys, &code, route, &phone()).expect("a pairing")
}

fn host_name_payload() -> Vec<u8> {
    host_named("Desk")
}

fn host_named(name: &str) -> Vec<u8> {
    json!({ "hostName": name }).to_string().into_bytes()
}

/// A typed-route pairing that reached message 2 with a host that knows the
/// code: the phone's answer to message 2, and the host's side.
fn pair_typed_with(host_name: &str) -> (Result<PairingCheck, SessionError>, HandshakeState) {
    let host = FakeHost::new();
    let keys = PhoneKeys::generate().unwrap();
    let (pairing, frame1) = start_pairing(&keys, PairingRoute::Typed);
    let mut noise = host.pairing(CODE);
    read_handshake(&mut noise, FrameKind::Pair1, &frame1).unwrap();
    let frame2 = write_handshake(&mut noise, FrameKind::Pair2, &host_named(host_name));
    (pairing.read_reply(&frame2, Instant::now()), noise)
}

fn json_of(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).expect("JSON")
}

#[test]
fn session_handshakes_pair_on_the_qr_route_with_matching_check_codes() {
    let host = FakeHost::new();
    let keys = PhoneKeys::generate().expect("phone keys");
    let route = PairingRoute::Qr {
        host_key: host.public_key(),
    };
    let (pairing, frame1) = start_pairing(&keys, route);

    let mut noise = host.pairing(CODE);
    let commit = json_of(&read_handshake(&mut noise, FrameKind::Pair1, &frame1).unwrap());
    let frame2 = write_handshake(&mut noise, FrameKind::Pair2, &host_name_payload());
    let check = pairing
        .read_reply(&frame2, Instant::now())
        .expect("message 2 is read");
    assert_eq!(check.host_name, "Desk");
    assert_eq!(check.host_key, host.public_key());

    let payload3 = read_handshake(&mut noise, FrameKind::Pair3, &check.frame3).unwrap();
    let details = json_of(&payload3);
    assert_eq!(details["name"], "Pixel 9");
    assert_eq!(details["platform"], "android");
    let nonce = base64url::decode(details["nonce"].as_str().unwrap()).expect("base64url");
    assert_eq!(nonce.len(), 16);

    // The host recomputes the commitment from what it now knows.
    let phone_key: [u8; 32] = noise.get_remote_static().unwrap().try_into().unwrap();
    assert_eq!(&phone_key, keys.public());
    let expected = base64url::encode(&pair_commit(&phone_key, &payload3));
    assert_eq!(commit, json!({ "commit": expected }));
    assert_eq!(check_code(noise.get_handshake_hash()), check.check_code);

    let mut host_session = noise.into_transport_mode().unwrap();
    let mut session = check.session;
    let paired = seal(
        &mut host_session,
        FrameKind::Message,
        br#"{"type":"paired"}"#,
    );
    assert_eq!(
        session.open(&paired),
        Ok(Opened::Message(br#"{"type":"paired"}"#.to_vec()))
    );
    let frames = session
        .seal(br#"{"type":"hello"}"#, Instant::now())
        .unwrap();
    assert_eq!(
        open(&mut host_session, &frames[0]).1,
        br#"{"type":"hello"}"#
    );
}

#[test]
fn session_handshakes_stop_before_message_3_when_the_qr_key_differs() {
    let host = FakeHost::new();
    let other = FakeHost::new();
    let keys = PhoneKeys::generate().unwrap();
    let route = PairingRoute::Qr {
        host_key: other.public_key(),
    };
    let (pairing, frame1) = start_pairing(&keys, route);

    let mut noise = host.pairing(CODE);
    read_handshake(&mut noise, FrameKind::Pair1, &frame1).unwrap();
    let frame2 = write_handshake(&mut noise, FrameKind::Pair2, &host_name_payload());
    assert_eq!(
        pairing.read_reply(&frame2, Instant::now()).err(),
        Some(SessionError::CantConfirm)
    );
}

#[test]
fn session_handshakes_send_a_message_3_the_host_cannot_read_with_another_code() {
    let host = FakeHost::new();
    let keys = PhoneKeys::generate().unwrap();
    let (pairing, frame1) = start_pairing(&keys, PairingRoute::Typed);

    let mut noise = host.pairing("9PW5WVT6EP67");
    read_handshake(&mut noise, FrameKind::Pair1, &frame1).unwrap();
    let frame2 = write_handshake(&mut noise, FrameKind::Pair2, &host_name_payload());
    let check = pairing
        .read_reply(&frame2, Instant::now())
        .expect("message 2 is read");
    assert_eq!(check.host_key, host.public_key());
    assert!(read_handshake(&mut noise, FrameKind::Pair3, &check.frame3).is_err());

    // The host's cleartext answer, which the phone reads on the session.
    let mut session = check.session;
    assert_eq!(
        session.open(&[0x31, 0, 4]),
        Err(SessionError::PairRefused {
            reason: PairRefusedReason::WrongCode,
            tries_left: 4
        })
    );
}

#[test]
fn session_handshakes_commit_to_a_fresh_message_3_each_time() {
    let host = FakeHost::new();
    let keys = PhoneKeys::generate().unwrap();
    let (_, first) = start_pairing(&keys, PairingRoute::Typed);
    let (_, second) = start_pairing(&keys, PairingRoute::Typed);
    let read = |frame1: &[u8]| read_handshake(&mut host.pairing(CODE), FrameKind::Pair1, frame1);
    assert_ne!(read(&first).unwrap(), read(&second).unwrap());
}

#[test]
fn session_handshakes_refuse_a_phone_name_over_64_bytes() {
    let keys = PhoneKeys::generate().unwrap();
    let code = PairingCode::parse(CODE).unwrap();
    let long = PhoneDetails {
        name: "é".repeat(33),
        platform: Platform::Ios,
    };
    assert_eq!(
        Pairing::start(&keys, &code, PairingRoute::Typed, &long).err(),
        Some(SessionError::NameTooLong)
    );
}

#[test]
fn session_handshakes_read_a_refusal_or_nothing_while_pairing() {
    let keys = PhoneKeys::generate().unwrap();
    let rate_limited = SessionError::PairRefused {
        reason: PairRefusedReason::RateLimited,
        tries_left: 0,
    };
    let answers: [(&[u8], SessionError); 4] = [
        (&[0x31, 3, 0], rate_limited),
        (&[0x31, 3, 1], SessionError::Unreadable),
        (&[0x20, 1, 2, 3], SessionError::Unreadable),
        (&[0x7f], SessionError::Unreadable),
    ];
    for (answer, expected) in answers {
        let (pairing, _) = start_pairing(&keys, PairingRoute::Typed);
        assert_eq!(
            pairing.read_reply(answer, Instant::now()).err(),
            Some(expected)
        );
    }
}

#[test]
fn session_handshakes_reconnect_to_the_pinned_host() {
    let host = FakeHost::new();
    let keys = PhoneKeys::generate().unwrap();
    let (reconnect, frame1) = Reconnect::start(&keys, &host.public_key()).unwrap();

    let mut noise = host.reconnect();
    assert!(
        read_handshake(&mut noise, FrameKind::Resume1, &frame1)
            .unwrap()
            .is_empty()
    );
    assert_eq!(noise.get_remote_static().unwrap(), keys.public());
    let frame2 = write_handshake(&mut noise, FrameKind::Resume2, &[]);
    let mut session = reconnect
        .read_reply(&frame2, Instant::now())
        .expect("a session");

    let mut host_session = noise.into_transport_mode().unwrap();
    let not_paired = seal(
        &mut host_session,
        FrameKind::Message,
        br#"{"type":"not-paired"}"#,
    );
    assert_eq!(
        session.open(&not_paired),
        Ok(Opened::Message(br#"{"type":"not-paired"}"#.to_vec()))
    );
}

#[test]
fn session_handshakes_cannot_confirm_a_host_whose_key_changed() {
    let host = FakeHost::new();
    let reinstalled = FakeHost::new();
    let keys = PhoneKeys::generate().unwrap();
    let (reconnect, frame1) = Reconnect::start(&keys, &host.public_key()).unwrap();
    assert!(read_handshake(&mut reinstalled.reconnect(), FrameKind::Resume1, &frame1).is_err());
    assert_eq!(
        reconnect.read_reply(&[0x30], Instant::now()).err(),
        Some(SessionError::CantConfirm)
    );
}

#[test]
fn session_handshakes_cannot_confirm_a_message_2_that_does_not_decrypt() {
    let host = FakeHost::new();
    let keys = PhoneKeys::generate().unwrap();
    let (reconnect, frame1) = Reconnect::start(&keys, &host.public_key()).unwrap();
    let mut noise = host.reconnect();
    read_handshake(&mut noise, FrameKind::Resume1, &frame1).unwrap();
    let mut frame2 = write_handshake(&mut noise, FrameKind::Resume2, &[]);
    let last = frame2.len() - 1;
    frame2[last] ^= 1;
    assert_eq!(
        reconnect.read_reply(&frame2, Instant::now()).err(),
        Some(SessionError::CantConfirm)
    );
}

#[test]
fn session_handshakes_read_garbage_while_reconnecting_as_unreadable() {
    let host = FakeHost::new();
    let keys = PhoneKeys::generate().unwrap();
    // A short message 2, a pairing frame, the pairing refusal, nothing.
    for answer in [&[0x12, 1, 2][..], &[0x02; 80], &[0x31, 0, 4], &[]] {
        let (reconnect, _) = Reconnect::start(&keys, &host.public_key()).unwrap();
        assert_eq!(
            reconnect.read_reply(answer, Instant::now()).err(),
            Some(SessionError::Unreadable),
            "{answer:?}"
        );
    }
}

#[test]
fn session_handshakes_read_handshake_failed_while_pairing_as_unreadable() {
    let keys = PhoneKeys::generate().unwrap();
    let (pairing, _) = start_pairing(&keys, PairingRoute::Typed);
    assert_eq!(
        pairing.read_reply(&[0x30], Instant::now()).err(),
        Some(SessionError::Unreadable)
    );
}

#[test]
fn session_handshakes_read_a_host_name_that_is_not_plain_text_as_unreadable() {
    // A line break, a right-to-left override, an isolate, a zero width space,
    // a byte order mark, a soft hyphen, the Mongolian vowel separator, a
    // deprecated shaping control, an interlinear annotation mark and a tag
    // character.
    for name in [
        "Desk\nPrinter",
        "Desk\u{202E}kseD",
        "\u{2067}Desk",
        "De\u{200B}sk",
        "\u{FEFF}Desk",
        "De\u{00AD}sk",
        "De\u{180E}sk",
        "Desk\u{206E}",
        "\u{FFF9}Desk",
        "Desk\u{E0041}",
    ] {
        assert_eq!(
            pair_typed_with(name).0.err(),
            Some(SessionError::Unreadable),
            "{name:?}"
        );
    }
    // Letters of a right-to-left script need no formatting characters.
    let (check, _) = pair_typed_with("مكتب");
    assert_eq!(check.expect("message 2 is read").host_name, "مكتب");
    // Persian writes some words with a zero width non-joiner.
    let (check, _) = pair_typed_with("می\u{200C}خواهم");
    assert_eq!(
        check.expect("message 2 is read").host_name,
        "می\u{200C}خواهم"
    );
}

#[test]
fn session_handshakes_read_no_refusal_after_the_host_rekeyed() {
    let (check, mut noise) = pair_typed_with("Desk");
    let check = check.expect("message 2 is read");
    read_handshake(&mut noise, FrameKind::Pair3, &check.frame3).unwrap();
    let mut host_session = noise.into_transport_mode().unwrap();
    let mut session = check.session;

    let rekey = seal(&mut host_session, FrameKind::Rekey, &[]);
    assert_eq!(session.open(&rekey), Ok(Opened::Rekeyed));
    assert_eq!(session.open(&[0x31, 0, 4]), Err(SessionError::Unreadable));
}
