//! The two Noise handshakes the phone starts (requirement
//! `session-handshakes`): `Noise_XXpsk3_25519_ChaChaPoly_SHA256` to pair, on
//! the QR and the typed route alike, and `Noise_IK_25519_ChaChaPoly_SHA256`
//! to reconnect to the host key it pinned. `snow` does every Noise step; this
//! module writes the payloads and decides what each answer means.

use std::time::Instant;

use halonic_blob_store::base64url;
use serde::{Deserialize, Serialize};
use snow::{Builder, HandshakeState};

use crate::codes::{CheckCode, PairingCode, check_code, pair_commit};
use crate::error::SessionError;
use crate::frames::{FrameKind, MAX_HANDSHAKE_BYTES, MAX_NAME_BYTES, frame, read_frame};
use crate::keys::{KEY_BYTES, PhoneKeys, fill_random};
use crate::session::Session;

/// The Noise handshake that pairs a new phone.
pub const PAIRING_PATTERN: &str = "Noise_XXpsk3_25519_ChaChaPoly_SHA256";

/// The Noise handshake a paired phone reconnects with.
pub const RECONNECT_PATTERN: &str = "Noise_IK_25519_ChaChaPoly_SHA256";

/// The prologue of both handshakes. It names protocol version 2, so a peer
/// of another version fails the handshake instead of negotiating.
pub const PROLOGUE: &str = "halonic-gateway/2";

/// The length of the fresh nonce in pairing message 3's payload.
pub const PAIR_COMMIT_NONCE_BYTES: usize = 16;

/// How the phone learned which computer it pairs with.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PairingRoute {
    /// From a QR code, which holds the host's static key: the key in
    /// message 2 must be that key, or the phone stops before message 3.
    Qr { host_key: [u8; KEY_BYTES] },
    /// From a typed code: the phone learns the host's key from message 2 and
    /// pins it only after the check code matches and Allow is pressed.
    Typed,
}

/// The phone's platform, as the host shows and keeps it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Android,
    Ios,
}

/// What the phone tells the host about itself in pairing message 3.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PhoneDetails {
    /// At most [`MAX_NAME_BYTES`] bytes of UTF-8.
    pub name: String,
    pub platform: Platform,
}

/// Pairing message 1's cleartext payload: the commitment to message 3.
#[derive(Serialize)]
struct CommitPayload {
    commit: String,
}

/// Pairing message 3's payload, written once so the commitment hashes the
/// exact bytes that are sent.
#[derive(Serialize)]
struct PhonePayload<'a> {
    name: &'a str,
    platform: Platform,
    nonce: String,
}

/// Pairing message 2's payload, from the host.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostPayload {
    host_name: String,
}

/// A pairing the phone has started and that waits for message 2.
pub struct Pairing {
    noise: HandshakeState,
    route: PairingRoute,
    payload3: Vec<u8>,
}

/// A pairing after message 2: the phone sends `frame3`, shows the check
/// code and waits on `session` for the host's encrypted answer.
pub struct PairingCheck {
    pub host_name: String,
    /// The host's static key, to pin once the host says `paired`.
    pub host_key: [u8; KEY_BYTES],
    pub check_code: CheckCode,
    /// Pairing message 3, to send at once.
    pub frame3: Vec<u8>,
    pub session: Session,
}

impl Pairing {
    /// Starts a pairing: gives it with pairing message 1, which carries the
    /// commitment to a message 3 with a fresh nonce.
    pub fn start(
        keys: &PhoneKeys,
        code: &PairingCode,
        route: PairingRoute,
        phone: &PhoneDetails,
    ) -> Result<(Self, Vec<u8>), SessionError> {
        if phone.name.len() > MAX_NAME_BYTES {
            return Err(SessionError::NameTooLong);
        }
        let psk = code.psk();
        let mut noise = Builder::new(PAIRING_PATTERN.parse()?)
            .local_private_key(keys.private())?
            .psk(3, psk.as_slice())?
            .prologue(PROLOGUE.as_bytes())?
            .build_initiator()?;

        let mut nonce = [0u8; PAIR_COMMIT_NONCE_BYTES];
        fill_random(&mut nonce)?;
        let payload3 = to_json(&PhonePayload {
            name: &phone.name,
            platform: phone.platform,
            nonce: base64url::encode(&nonce),
        })?;
        let commit = pair_commit(keys.public(), &payload3);
        let payload1 = to_json(&CommitPayload {
            commit: base64url::encode(&commit),
        })?;
        let message1 = write_handshake(&mut noise, &payload1)?;
        let pairing = Self {
            noise,
            route,
            payload3,
        };
        Ok((pairing, frame(FrameKind::Pair1, &message1)))
    }

    /// Reads the host's answer to message 1: pairing message 2, or a
    /// cleartext refusal. On the QR route a host key that isn't the QR's
    /// stops here, so no message 3 ever reaches another computer.
    pub fn read_reply(mut self, bytes: &[u8], now: Instant) -> Result<PairingCheck, SessionError> {
        let body = handshake_body(bytes, FrameKind::Pair2, FrameKind::PairRefused)?;
        let payload2 =
            read_handshake(&mut self.noise, body).map_err(|_| SessionError::Unreadable)?;
        let host_key: [u8; KEY_BYTES] = self
            .noise
            .get_remote_static()
            .and_then(|key| key.try_into().ok())
            .ok_or(SessionError::Unreadable)?;
        if let PairingRoute::Qr { host_key: pinned } = self.route
            && pinned != host_key
        {
            return Err(SessionError::CantConfirm);
        }
        let host_name = serde_json::from_slice::<HostPayload>(&payload2)
            .map_err(|_| SessionError::Unreadable)?
            .host_name;
        // On the typed route a fake host chooses the name, so it must show
        // as the plain text it is. The check code is the real defence.
        if host_name.len() > MAX_NAME_BYTES || !is_plain_name(&host_name) {
            return Err(SessionError::Unreadable);
        }

        let message3 = write_handshake(&mut self.noise, &self.payload3)?;
        let check_code = check_code(self.noise.get_handshake_hash());
        Ok(PairingCheck {
            host_name,
            host_key,
            check_code,
            frame3: frame(FrameKind::Pair3, &message3),
            // Until the host answers, its refusal of message 3 is cleartext.
            session: Session::new(
                self.noise.into_transport_mode()?,
                Some(FrameKind::PairRefused),
                now,
            ),
        })
    }
}

/// A reconnect the phone has started and that waits for message 2.
pub struct Reconnect {
    noise: HandshakeState,
}

impl Reconnect {
    /// Starts a reconnect to the host key the phone pinned: gives it with
    /// reconnect message 1, which carries the phone's static key encrypted
    /// to the host's.
    pub fn start(
        keys: &PhoneKeys,
        host_key: &[u8; KEY_BYTES],
    ) -> Result<(Self, Vec<u8>), SessionError> {
        let mut noise = Builder::new(RECONNECT_PATTERN.parse()?)
            .local_private_key(keys.private())?
            .remote_public_key(host_key)?
            .prologue(PROLOGUE.as_bytes())?
            .build_initiator()?;
        let message1 = write_handshake(&mut noise, &[])?;
        Ok((Self { noise }, frame(FrameKind::Resume1, &message1)))
    }

    /// Reads the host's answer to message 1. Message 2 that decrypts proves
    /// the host holds the pinned key; one that doesn't, or a cleartext
    /// `handshake-failed`, is [`SessionError::CantConfirm`].
    pub fn read_reply(mut self, bytes: &[u8], now: Instant) -> Result<Session, SessionError> {
        let body = handshake_body(bytes, FrameKind::Resume2, FrameKind::HandshakeFailed)?;
        let payload = read_handshake(&mut self.noise, body).map_err(|error| match error {
            snow::Error::Decrypt => SessionError::CantConfirm,
            _ => SessionError::Unreadable,
        })?;
        // The reconnect handshake's payloads are empty.
        if !payload.is_empty() {
            return Err(SessionError::Unreadable);
        }
        Ok(Session::new(self.noise.into_transport_mode()?, None, now))
    }
}

/// The body of the handshake frame the phone waits for. The one cleartext
/// refusal the host sends at this point is what it says; any other frame,
/// the other refusal included, is unreadable.
fn handshake_body(
    bytes: &[u8],
    expected: FrameKind,
    refusal: FrameKind,
) -> Result<&[u8], SessionError> {
    match read_frame(bytes) {
        Some((kind, body)) if kind == expected => Ok(body),
        Some((kind, _)) if kind == refusal => Err(SessionError::from_cleartext(bytes)),
        _ => Err(SessionError::Unreadable),
    }
}

/// Whether `name` shows as the plain text it is: no control characters and
/// none that change how the text around them is laid out.
fn is_plain_name(name: &str) -> bool {
    name.chars()
        .all(|character| !character.is_control() && !is_layout_control(character))
}

/// The characters that lay text out rather than show as text: the line and
/// paragraph separators, and the bidi marks, embeddings, overrides and
/// isolates, which can show a name's letters in another order.
fn is_layout_control(character: char) -> bool {
    matches!(
        character,
        '\u{061C}' | '\u{200E}' | '\u{200F}' | '\u{2028}'..='\u{202E}' | '\u{2066}'..='\u{2069}'
    )
}

fn write_handshake(noise: &mut HandshakeState, payload: &[u8]) -> Result<Vec<u8>, SessionError> {
    let mut message = vec![0u8; MAX_HANDSHAKE_BYTES];
    let length = noise.write_message(payload, &mut message)?;
    message.truncate(length);
    Ok(message)
}

fn read_handshake(noise: &mut HandshakeState, message: &[u8]) -> Result<Vec<u8>, snow::Error> {
    let mut payload = vec![0u8; MAX_HANDSHAKE_BYTES];
    let length = noise.read_message(message, &mut payload)?;
    payload.truncate(length);
    Ok(payload)
}

fn to_json(value: &impl Serialize) -> Result<Vec<u8>, SessionError> {
    serde_json::to_vec(value).map_err(|_| SessionError::Crypto)
}
