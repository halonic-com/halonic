//! The end-to-end session after a handshake (requirement `session-rekey`):
//! one gateway message per Noise transport message, and each side rekeying
//! its own sending direction.

use std::time::{Duration, Instant};

use snow::TransportState;

use crate::error::SessionError;
use crate::frames::{FrameKind, NOISE_MAX_MESSAGE_BYTES, frame, read_frame};

/// The length of the tag on every Noise transport message.
const TAG_BYTES: usize = 16;

/// The largest gateway message: a Noise message less its tag.
pub const MAX_MESSAGE_BYTES: usize = NOISE_MAX_MESSAGE_BYTES - TAG_BYTES;

/// A sender rekeys at the latest this long after its last rekey.
pub const REKEY_AFTER: Duration = Duration::from_secs(30 * 60);

/// A sender's `rekey` frame is at the latest its this-many-th transport
/// message since the last one; a reader closes when one more message than
/// this arrives without it.
pub const REKEY_AFTER_MESSAGES: u32 = 10_000;

/// What one frame read from the session gave.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Opened {
    /// A gateway message, decrypted.
    Message(Vec<u8>),
    /// The other side rekeyed its sending direction; nothing to pass on.
    Rekeyed,
}

/// A Noise session in transport mode. It fails closed: the first error that
/// ends it (a frame it can't read, a refusal, a crypto failure) leaves it
/// ended, and every later call gives [`SessionError::Ended`], so no caller
/// can go on using a session the other side may have tampered with.
pub struct Session {
    noise: TransportState,
    /// The cleartext refusal the host may still send, if any.
    refusal: Option<FrameKind>,
    sent_since_rekey: u32,
    received_since_rekey: u32,
    rekeyed_at: Instant,
    ended: bool,
}

impl Session {
    pub(crate) fn new(noise: TransportState, refusal: Option<FrameKind>, now: Instant) -> Self {
        Self {
            noise,
            refusal,
            sent_since_rekey: 0,
            received_since_rekey: 0,
            rekeyed_at: now,
            ended: false,
        }
    }

    /// Seals one gateway message. Gives the frames to send, in order: a
    /// `rekey` frame first when one is due, then the message.
    pub fn seal(&mut self, message: &[u8], now: Instant) -> Result<Vec<Vec<u8>>, SessionError> {
        // A message too large is the caller's mistake and changes nothing,
        // so it doesn't end the session.
        if message.len() > MAX_MESSAGE_BYTES {
            return Err(SessionError::MessageTooLarge);
        }
        self.ending_on_error(|session| {
            let mut frames = Vec::with_capacity(2);
            frames.extend(session.rekey_frame_if_due(now)?);
            frames.push(frame(FrameKind::Message, &session.encrypt(message)?));
            session.sent_since_rekey += 1;
            Ok(frames)
        })
    }

    /// A `rekey` frame when one is due by time or by count, after which the
    /// sending direction uses its new key. The transport also calls it on a
    /// timer, so a quiet session still rekeys every 30 minutes.
    pub fn rekey_if_due(&mut self, now: Instant) -> Result<Option<Vec<u8>>, SessionError> {
        self.ending_on_error(|session| session.rekey_frame_if_due(now))
    }

    /// Opens one frame from the other side. The cleartext refusal the host
    /// may still send is what it says; any other frame that isn't a
    /// transport message, doesn't decrypt or goes past the rekey limit ends
    /// the session. Once any frame has decrypted, no refusal is read.
    pub fn open(&mut self, bytes: &[u8]) -> Result<Opened, SessionError> {
        self.ending_on_error(|session| session.open_frame(bytes))
    }

    /// Runs one step of the session, unless an earlier error ended it, and
    /// ends it when this step fails.
    fn ending_on_error<T>(
        &mut self,
        step: impl FnOnce(&mut Self) -> Result<T, SessionError>,
    ) -> Result<T, SessionError> {
        if self.ended {
            return Err(SessionError::Ended);
        }
        let result = step(self);
        self.ended = result.is_err();
        result
    }

    fn rekey_frame_if_due(&mut self, now: Instant) -> Result<Option<Vec<u8>>, SessionError> {
        // The rekey frame itself is a transport message, so it takes the
        // last place of the count.
        let count_due = self.sent_since_rekey + 1 >= REKEY_AFTER_MESSAGES;
        let time_due = now.saturating_duration_since(self.rekeyed_at) >= REKEY_AFTER;
        if !count_due && !time_due {
            return Ok(None);
        }
        let rekey = frame(FrameKind::Rekey, &self.encrypt(&[])?);
        self.noise.rekey_outgoing();
        self.sent_since_rekey = 0;
        self.rekeyed_at = now;
        Ok(Some(rekey))
    }

    fn open_frame(&mut self, bytes: &[u8]) -> Result<Opened, SessionError> {
        match read_frame(bytes) {
            Some((FrameKind::Message, body)) => {
                if self.received_since_rekey >= REKEY_AFTER_MESSAGES {
                    return Err(SessionError::Unreadable);
                }
                let message = self.decrypt(body)?;
                self.received_since_rekey += 1;
                Ok(Opened::Message(message))
            }
            Some((FrameKind::Rekey, body)) => {
                if !self.decrypt(body)?.is_empty() {
                    return Err(SessionError::Unreadable);
                }
                self.noise.rekey_incoming();
                self.received_since_rekey = 0;
                Ok(Opened::Rekeyed)
            }
            Some((kind, _)) if Some(kind) == self.refusal => {
                Err(SessionError::from_cleartext(bytes))
            }
            _ => Err(SessionError::Unreadable),
        }
    }

    fn encrypt(&mut self, message: &[u8]) -> Result<Vec<u8>, SessionError> {
        let mut sealed = vec![0u8; message.len() + TAG_BYTES];
        let length = self.noise.write_message(message, &mut sealed)?;
        sealed.truncate(length);
        Ok(sealed)
    }

    fn decrypt(&mut self, sealed: &[u8]) -> Result<Vec<u8>, SessionError> {
        let mut message = vec![0u8; sealed.len()];
        let length = self
            .noise
            .read_message(sealed, &mut message)
            .map_err(|_| SessionError::Unreadable)?;
        message.truncate(length);
        // Only the host holds the session's keys, so once any frame of its,
        // a `rekey` too, has decrypted, a cleartext refusal can't be its.
        self.refusal = None;
        Ok(message)
    }
}
