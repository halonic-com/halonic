//! The session after a handshake: sealing, opening and rekeying.

mod support;

use std::time::{Duration, Instant};

use halonic_tunnel::{
    FrameKind, MAX_MESSAGE_BYTES, Opened, PhoneKeys, REKEY_AFTER, REKEY_AFTER_MESSAGES, Reconnect,
    Session, SessionError, read_frame,
};
use snow::TransportState;
use support::{FakeHost, open, read_handshake, seal, write_handshake};

/// A phone session reconnected to a fake host, with the host's side.
fn connected(now: Instant) -> (Session, TransportState) {
    let host = FakeHost::new();
    let keys = PhoneKeys::generate().unwrap();
    let (reconnect, frame1) = Reconnect::start(&keys, &host.public_key()).unwrap();
    let mut noise = host.reconnect();
    read_handshake(&mut noise, FrameKind::Resume1, &frame1).unwrap();
    let frame2 = write_handshake(&mut noise, FrameKind::Resume2, &[]);
    let session = reconnect.read_reply(&frame2, now).unwrap();
    (session, noise.into_transport_mode().unwrap())
}

fn kind_of(frame: &[u8]) -> FrameKind {
    read_frame(frame).expect("a frame").0
}

#[test]
fn session_rekey_comes_as_the_ten_thousandth_message() {
    let now = Instant::now();
    let (mut session, mut host) = connected(now);
    for _ in 1..REKEY_AFTER_MESSAGES {
        let frames = session.seal(b"event", now).unwrap();
        assert_eq!(frames.len(), 1);
        open(&mut host, &frames[0]);
    }
    let frames = session.seal(b"after", now).unwrap();
    assert_eq!(
        frames.iter().map(|f| kind_of(f)).collect::<Vec<_>>(),
        [FrameKind::Rekey, FrameKind::Message]
    );
    assert_eq!(open(&mut host, &frames[0]), (FrameKind::Rekey, Vec::new()));
    // The host rekeyed its receiving key, so the next message still opens.
    assert_eq!(open(&mut host, &frames[1]).1, b"after");
}

#[test]
fn session_rekey_comes_after_30_minutes_even_when_quiet() {
    let start = Instant::now();
    let (mut session, mut host) = connected(start);
    assert_eq!(
        session.rekey_if_due(start + REKEY_AFTER - Duration::from_secs(1)),
        Ok(None)
    );
    let rekey = session
        .rekey_if_due(start + REKEY_AFTER)
        .unwrap()
        .expect("a rekey frame");
    assert_eq!(open(&mut host, &rekey).0, FrameKind::Rekey);
    let frames = session.seal(b"later", start + REKEY_AFTER).unwrap();
    assert_eq!(frames.len(), 1);
    assert_eq!(open(&mut host, &frames[0]).1, b"later");
}

#[test]
fn session_rekey_is_followed_when_the_host_rekeys() {
    let (mut session, mut host) = connected(Instant::now());
    let rekey = seal(&mut host, FrameKind::Rekey, &[]);
    host.rekey_outgoing();
    assert_eq!(session.open(&rekey), Ok(Opened::Rekeyed));
    let message = seal(&mut host, FrameKind::Message, b"welcome");
    assert_eq!(
        session.open(&message),
        Ok(Opened::Message(b"welcome".to_vec()))
    );
}

#[test]
fn session_rekey_missing_after_ten_thousand_messages_ends_the_session() {
    let (mut session, mut host) = connected(Instant::now());
    for _ in 0..REKEY_AFTER_MESSAGES {
        let message = seal(&mut host, FrameKind::Message, b"event");
        assert!(session.open(&message).is_ok());
    }
    let one_more = seal(&mut host, FrameKind::Message, b"event");
    assert_eq!(session.open(&one_more), Err(SessionError::Unreadable));
}

#[test]
fn session_rekey_frame_must_be_empty() {
    let (mut session, mut host) = connected(Instant::now());
    let rekey = seal(&mut host, FrameKind::Rekey, b"not empty");
    assert_eq!(session.open(&rekey), Err(SessionError::Unreadable));
}

#[test]
fn session_rekey_refuses_what_the_session_cannot_carry() {
    let now = Instant::now();
    let (mut session, mut host) = connected(now);
    let largest = vec![b'x'; MAX_MESSAGE_BYTES];
    let frames = session.seal(&largest, now).unwrap();
    assert_eq!(open(&mut host, &frames[0]).1, largest);
    assert_eq!(
        session.seal(&[b'x'; MAX_MESSAGE_BYTES + 1], now),
        Err(SessionError::MessageTooLarge)
    );
    // The caller's mistake doesn't end the session.
    let frames = session.seal(b"smaller", now).unwrap();
    assert_eq!(open(&mut host, &frames[0]).1, b"smaller");

    let mut tampered = seal(&mut host, FrameKind::Message, b"event");
    tampered[3] ^= 1;
    assert_eq!(session.open(&tampered), Err(SessionError::Unreadable));
}

#[test]
fn session_rekey_reads_no_refusal_after_a_reconnect() {
    // A fresh session for each refusal, since the first one ends the session.
    for refusal in [&[0x30][..], &[0x31, 0, 4]] {
        let (mut session, _) = connected(Instant::now());
        assert_eq!(session.open(refusal), Err(SessionError::Unreadable));
    }
}

#[test]
fn session_rekey_ends_for_good_after_a_frame_that_does_not_decrypt() {
    let now = Instant::now();
    let (mut session, mut host) = connected(now);
    let mut tampered = seal(&mut host, FrameKind::Message, b"event");
    tampered[3] ^= 1;
    assert_eq!(session.open(&tampered), Err(SessionError::Unreadable));

    // A valid frame after it is refused, and nothing more is sent.
    let valid = seal(&mut host, FrameKind::Message, b"event");
    assert_eq!(session.open(&valid), Err(SessionError::Ended));
    assert_eq!(session.seal(b"reply", now), Err(SessionError::Ended));
    assert_eq!(
        session.rekey_if_due(now + REKEY_AFTER),
        Err(SessionError::Ended)
    );
}

#[test]
fn session_rekey_ends_for_good_after_a_rekey_frame_that_is_not_empty() {
    let (mut session, mut host) = connected(Instant::now());
    let rekey = seal(&mut host, FrameKind::Rekey, b"not empty");
    assert_eq!(session.open(&rekey), Err(SessionError::Unreadable));
    let valid = seal(&mut host, FrameKind::Message, b"event");
    assert_eq!(session.open(&valid), Err(SessionError::Ended));
}
