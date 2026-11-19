//! The session's frames and the two cleartext refusals.

use halonic_tunnel::{
    FrameKind, MAX_FRAME_BYTES, MAX_HANDSHAKE_BYTES, PairRefusedReason, Refusal, frame, read_frame,
    read_refusal,
};

#[test]
fn session_frames_use_the_bytes_of_the_ports_package() {
    let bytes = [
        (FrameKind::Pair1, 0x01),
        (FrameKind::Pair2, 0x02),
        (FrameKind::Pair3, 0x03),
        (FrameKind::Resume1, 0x11),
        (FrameKind::Resume2, 0x12),
        (FrameKind::Message, 0x20),
        (FrameKind::Rekey, 0x21),
        (FrameKind::HandshakeFailed, 0x30),
        (FrameKind::PairRefused, 0x31),
    ];
    for (kind, byte) in bytes {
        assert_eq!(kind.byte(), byte);
        assert_eq!(FrameKind::from_byte(byte), Some(kind));
    }
    let cleartext: Vec<_> = bytes
        .iter()
        .filter(|(kind, _)| kind.is_cleartext())
        .collect();
    assert_eq!(cleartext.len(), 2);
    assert_eq!(FrameKind::from_byte(0x00), None);
    assert_eq!(FrameKind::from_byte(0x22), None);
}

#[test]
fn session_frames_are_read_back_as_written() {
    let written = frame(FrameKind::Message, b"sealed");
    assert_eq!(written[0], 0x20);
    assert_eq!(
        read_frame(&written),
        Some((FrameKind::Message, &b"sealed"[..]))
    );
}

#[test]
fn session_frames_refuse_empty_unknown_and_oversized_frames() {
    assert_eq!(read_frame(&[]), None);
    assert_eq!(read_frame(&[0x7f, 1, 2]), None);

    let largest = vec![FrameKind::Message.byte(); MAX_FRAME_BYTES];
    assert!(read_frame(&largest).is_some());
    let too_large = vec![FrameKind::Message.byte(); MAX_FRAME_BYTES + 1];
    assert_eq!(read_frame(&too_large), None);

    let handshake = frame(FrameKind::Pair2, &vec![0; MAX_HANDSHAKE_BYTES]);
    assert!(read_frame(&handshake).is_some());
    let handshake_too_large = frame(FrameKind::Resume2, &vec![0; MAX_HANDSHAKE_BYTES + 1]);
    assert_eq!(read_frame(&handshake_too_large), None);
}

#[test]
fn session_frames_read_the_refusals_the_host_writes() {
    assert_eq!(read_refusal(&[0x30]), Some(Refusal::HandshakeFailed));
    assert_eq!(
        read_refusal(&[0x31, 0, 4]),
        Some(Refusal::PairRefused {
            reason: PairRefusedReason::WrongCode,
            tries_left: 4
        })
    );
    assert_eq!(
        read_refusal(&[0x31, 3, 0]),
        Some(Refusal::PairRefused {
            reason: PairRefusedReason::RateLimited,
            tries_left: 0
        })
    );
}

#[test]
fn session_frames_read_nothing_else_as_a_refusal() {
    let unreadable: [&[u8]; 8] = [
        &[],
        &[0x30, 0],
        &[0x31, 0],
        &[0x31, 0, 0],
        &[0x31, 0, 5],
        &[0x31, 2, 1],
        &[0x31, 4, 0],
        &[0x20, 0, 0],
    ];
    for bytes in unreadable {
        assert_eq!(read_refusal(bytes), None, "{bytes:?}");
    }
}
