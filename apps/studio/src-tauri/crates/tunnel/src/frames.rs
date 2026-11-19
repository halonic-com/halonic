//! The binary frames the end-to-end session travels in (requirement
//! `session-frames`): one kind byte, then one Noise message. The kinds, sizes
//! and the two cleartext refusals are those of `remote-gateway-session.ts` in
//! `@halonicjs/ports`.

/// The largest Noise message, handshake or transport, by the Noise spec.
pub const NOISE_MAX_MESSAGE_BYTES: usize = 65_535;

/// The largest frame: a kind byte and one Noise message.
pub const MAX_FRAME_BYTES: usize = 1 + NOISE_MAX_MESSAGE_BYTES;

/// The largest handshake message, without its kind byte. A larger one is an
/// attack, since pairing message 3, the longest, holds a key, a tag and a
/// payload with a name of at most [`MAX_NAME_BYTES`].
pub const MAX_HANDSHAKE_BYTES: usize = 1_024;

/// The longest name in a handshake payload, in bytes of UTF-8.
pub const MAX_NAME_BYTES: usize = 64;

/// What a frame holds, by its first byte.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameKind {
    /// Pairing message 1, from the phone.
    Pair1,
    /// Pairing message 2, from the host.
    Pair2,
    /// Pairing message 3, from the phone.
    Pair3,
    /// Reconnect message 1, from the phone.
    Resume1,
    /// Reconnect message 2, from the host.
    Resume2,
    /// One Noise transport message holding one gateway message.
    Message,
    /// An empty transport message, the sender's last under its old key.
    Rekey,
    /// Cleartext: the host couldn't decrypt reconnect message 1.
    HandshakeFailed,
    /// Cleartext: the host refused a pairing before message 3 decrypted.
    PairRefused,
}

impl FrameKind {
    const ALL: [Self; 9] = [
        Self::Pair1,
        Self::Pair2,
        Self::Pair3,
        Self::Resume1,
        Self::Resume2,
        Self::Message,
        Self::Rekey,
        Self::HandshakeFailed,
        Self::PairRefused,
    ];

    /// The kind's first byte, as in `gatewayFrameKinds`.
    pub const fn byte(self) -> u8 {
        match self {
            Self::Pair1 => 0x01,
            Self::Pair2 => 0x02,
            Self::Pair3 => 0x03,
            Self::Resume1 => 0x11,
            Self::Resume2 => 0x12,
            Self::Message => 0x20,
            Self::Rekey => 0x21,
            Self::HandshakeFailed => 0x30,
            Self::PairRefused => 0x31,
        }
    }

    /// The kind a first byte names, or `None` for any other byte.
    pub fn from_byte(byte: u8) -> Option<Self> {
        Self::ALL.into_iter().find(|kind| kind.byte() == byte)
    }

    /// Whether the kind is one of the two cleartext refusals.
    pub const fn is_cleartext(self) -> bool {
        matches!(self, Self::HandshakeFailed | Self::PairRefused)
    }

    /// Whether the kind carries a handshake message, which has its own
    /// smaller size limit.
    pub const fn is_handshake(self) -> bool {
        matches!(
            self,
            Self::Pair1 | Self::Pair2 | Self::Pair3 | Self::Resume1 | Self::Resume2
        )
    }
}

/// Writes a frame: the kind byte, then `body`.
pub fn frame(kind: FrameKind, body: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(1 + body.len());
    bytes.push(kind.byte());
    bytes.extend_from_slice(body);
    bytes
}

/// Splits a frame into its kind and its body. `None` when it is empty, its
/// kind is unknown, it is larger than [`MAX_FRAME_BYTES`], or it is a
/// handshake frame larger than [`MAX_HANDSHAKE_BYTES`]: the connection
/// closes on any of those.
pub fn read_frame(bytes: &[u8]) -> Option<(FrameKind, &[u8])> {
    let (&first, body) = bytes.split_first()?;
    let kind = FrameKind::from_byte(first)?;
    let limit = if kind.is_handshake() {
        MAX_HANDSHAKE_BYTES
    } else {
        NOISE_MAX_MESSAGE_BYTES
    };
    (body.len() <= limit).then_some((kind, body))
}

/// Why the host refused a pairing before message 3 decrypted, in the order
/// of the byte that encodes each (`pairRefusedReasons`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PairRefusedReason {
    /// Message 3 didn't decrypt.
    WrongCode,
    /// The code ran out, had its last wrong try or its dialog was closed.
    CodeEnded,
    /// Another phone's message 3 already used the code.
    CodeUsed,
    /// The host has had too many failed tries this minute.
    RateLimited,
}

impl PairRefusedReason {
    const ALL: [Self; 4] = [
        Self::WrongCode,
        Self::CodeEnded,
        Self::CodeUsed,
        Self::RateLimited,
    ];

    /// The tries a refusal for this reason may say are left: 1 to 4 for a
    /// wrong code, none for the rest.
    fn tries_left_allowed(self) -> std::ops::RangeInclusive<u8> {
        match self {
            Self::WrongCode => 1..=4,
            _ => 0..=0,
        }
    }
}

/// One of the two cleartext frames. Both are informative: anyone on the
/// path could fake one, so neither may make the phone clear anything.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    /// The host couldn't decrypt reconnect message 1: its key changed. The
    /// phone shows "Can't confirm your computer".
    HandshakeFailed,
    /// The host refused a pairing before message 3 decrypted.
    PairRefused {
        reason: PairRefusedReason,
        tries_left: u8,
    },
}

/// Reads a whole cleartext frame, kind byte included, exactly as the host's
/// `encodeCleartextFrame` writes it. Anything else, such as an unknown
/// reason, a wrong length or tries left the rules don't allow, is `None`:
/// bytes the phone can't read.
pub fn read_refusal(bytes: &[u8]) -> Option<Refusal> {
    match *bytes {
        [kind] if kind == FrameKind::HandshakeFailed.byte() => Some(Refusal::HandshakeFailed),
        [kind, reason, tries_left] if kind == FrameKind::PairRefused.byte() => {
            let reason = *PairRefusedReason::ALL.get(usize::from(reason))?;
            reason
                .tries_left_allowed()
                .contains(&tries_left)
                .then_some(Refusal::PairRefused { reason, tries_left })
        }
        _ => None,
    }
}
