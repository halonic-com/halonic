//! A fake host for the handshake and session tests: the responder side of
//! both Noise patterns, built straight on `snow`, as the host's own Noise
//! adapter (B1) will be.

#![allow(dead_code)]

use halonic_tunnel::{
    FrameKind, MAX_HANDSHAKE_BYTES, PAIRING_PATTERN, PROLOGUE, PairingCode, RECONNECT_PATTERN,
    frame, read_frame,
};
use snow::{Builder, HandshakeState, Keypair, TransportState};

pub struct FakeHost {
    keys: Keypair,
}

impl FakeHost {
    pub fn new() -> Self {
        let params = PAIRING_PATTERN.parse().expect("a Noise pattern");
        let keys = Builder::new(params)
            .generate_keypair()
            .expect("a host key pair");
        Self { keys }
    }

    pub fn public_key(&self) -> [u8; 32] {
        self.keys.public.clone().try_into().expect("32 bytes")
    }

    /// The host's side of a pairing with `code`.
    pub fn pairing(&self, code: &str) -> HandshakeState {
        let psk = PairingCode::parse(code).expect("a plain code").psk();
        Builder::new(PAIRING_PATTERN.parse().expect("a Noise pattern"))
            .local_private_key(&self.keys.private)
            .and_then(|builder| builder.psk(3, psk.as_slice()))
            .and_then(|builder| builder.prologue(PROLOGUE.as_bytes()))
            .and_then(|builder| builder.build_responder())
            .expect("a pairing responder")
    }

    /// The host's side of a reconnect.
    pub fn reconnect(&self) -> HandshakeState {
        Builder::new(RECONNECT_PATTERN.parse().expect("a Noise pattern"))
            .local_private_key(&self.keys.private)
            .and_then(|builder| builder.prologue(PROLOGUE.as_bytes()))
            .and_then(|builder| builder.build_responder())
            .expect("a reconnect responder")
    }
}

/// Reads a handshake frame of `kind` and gives its payload.
pub fn read_handshake(
    noise: &mut HandshakeState,
    kind: FrameKind,
    bytes: &[u8],
) -> Result<Vec<u8>, snow::Error> {
    let (read_kind, body) = read_frame(bytes).expect("a frame");
    assert_eq!(read_kind, kind);
    let mut payload = vec![0u8; MAX_HANDSHAKE_BYTES];
    let length = noise.read_message(body, &mut payload)?;
    payload.truncate(length);
    Ok(payload)
}

/// Writes a handshake frame of `kind` with `payload`.
pub fn write_handshake(noise: &mut HandshakeState, kind: FrameKind, payload: &[u8]) -> Vec<u8> {
    let mut message = vec![0u8; MAX_HANDSHAKE_BYTES];
    let length = noise
        .write_message(payload, &mut message)
        .expect("a handshake message");
    message.truncate(length);
    frame(kind, &message)
}

/// Seals one transport frame of `kind` (`message` or `rekey`).
pub fn seal(noise: &mut TransportState, kind: FrameKind, message: &[u8]) -> Vec<u8> {
    let mut sealed = vec![0u8; message.len() + 16];
    let length = noise
        .write_message(message, &mut sealed)
        .expect("a transport message");
    sealed.truncate(length);
    frame(kind, &sealed)
}

/// Opens one transport frame the phone sent, rekeying on a `rekey` frame.
pub fn open(noise: &mut TransportState, bytes: &[u8]) -> (FrameKind, Vec<u8>) {
    let (kind, body) = read_frame(bytes).expect("a frame");
    let mut message = vec![0u8; body.len()];
    let length = noise
        .read_message(body, &mut message)
        .expect("a message that decrypts");
    message.truncate(length);
    if kind == FrameKind::Rekey {
        noise.rekey_incoming();
    }
    (kind, message)
}
