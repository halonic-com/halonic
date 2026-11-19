use std::fmt;

use crate::frames::{PairRefusedReason, Refusal, read_refusal};

/// Why a handshake or a session stopped, told apart only as far as the
/// phone can see it (ADR "Pairing and the end-to-end session"). None of
/// these clears anything on the phone: only an encrypted `not-paired`,
/// after the host has proved who it is, means Removed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionError {
    /// Bytes the phone can't read: an unknown or unexpected frame, one out of
    /// order or too large, or a transport message that doesn't decrypt.
    /// Anyone on the path can cause it, so it is "Can't reach" or
    /// "Reconnecting".
    Unreadable,
    /// The phone couldn't confirm the computer: the host sent
    /// `handshake-failed`, reconnect message 2 didn't decrypt to the pinned
    /// key, or on the QR route the key in pairing message 2 isn't the QR's.
    CantConfirm,
    /// The host refused the pairing in cleartext. Informative only.
    PairRefused {
        reason: PairRefusedReason,
        tries_left: u8,
    },
    /// The phone's name is longer than a handshake payload allows.
    NameTooLong,
    /// A message is longer than one Noise transport message holds.
    MessageTooLarge,
    /// The phone's own crypto or random source failed.
    Crypto,
    /// An earlier error ended the session, so it reads and sends nothing
    /// more. The phone connects again with a new handshake.
    Ended,
}

impl SessionError {
    /// The error for a cleartext frame: what the refusal says, or
    /// [`SessionError::Unreadable`] when it isn't one the host writes.
    pub(crate) fn from_cleartext(bytes: &[u8]) -> Self {
        match read_refusal(bytes) {
            Some(Refusal::HandshakeFailed) => Self::CantConfirm,
            Some(Refusal::PairRefused { reason, tries_left }) => {
                Self::PairRefused { reason, tries_left }
            }
            None => Self::Unreadable,
        }
    }
}

impl From<snow::Error> for SessionError {
    fn from(_: snow::Error) -> Self {
        Self::Crypto
    }
}

impl fmt::Display for SessionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let text = match self {
            Self::Unreadable => "the other side sent bytes the phone can't read",
            Self::CantConfirm => "the phone couldn't confirm the computer",
            Self::PairRefused { .. } => "the computer refused the pairing",
            Self::NameTooLong => "the phone's name is too long for the handshake",
            Self::MessageTooLarge => "the message is too large for one Noise message",
            Self::Crypto => "the phone's crypto failed",
            Self::Ended => "the session already ended",
        };
        formatter.write_str(text)
    }
}

impl std::error::Error for SessionError {}
