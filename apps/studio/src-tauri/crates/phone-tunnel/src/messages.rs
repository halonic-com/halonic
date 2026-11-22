//! The gateway messages the page sends through the tunnel (D7a,
//! HAL-15177; the D7 design on HAL-15159, section 1, and Julian's L1 on
//! HAL-15181). The shell checks each one before sealing it and sends
//! nothing when a check fails. It reads only the `type`: the host's own
//! parser stays the authority on everything else.

use std::fmt;

use halonic_tunnel::MAX_MESSAGE_BYTES;
use serde::de::{self, Deserializer, IgnoredAny, MapAccess, Visitor};
use serde::{Deserialize, Serialize};

/// The largest message the page may send, in UTF-8 bytes: what one
/// transport message holds after its tag, the host's
/// `gatewayMaxMessageBytes` (65,519).
pub const GATEWAY_MAX_MESSAGE_BYTES: usize = MAX_MESSAGE_BYTES;

/// The six messages a phone may send (`ports.remote-gateway-protocol`).
pub const PHONE_MESSAGE_TYPES: [&str; 6] = [
    "hello",
    "list-sessions",
    "watch",
    "unwatch",
    "answer-approval",
    "prompt",
];

/// Why a message wasn't sent. Nothing was, and the session stays open.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SendRefusal {
    /// No session is open for that computer, the generation isn't the
    /// open session's, or the session ended while sending.
    NotOpen,
    /// More than [`GATEWAY_MAX_MESSAGE_BYTES`] bytes of UTF-8.
    TooLarge,
    /// Not exactly one JSON object with one `type` that a phone may send.
    NotAllowed,
}

/// What became of a send, as the page reads it:
/// `{ "sent": true }` or `{ "sent": false, "reason": "not-open" }`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct SendAnswer {
    sent: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<SendRefusal>,
}

impl From<Result<(), SendRefusal>> for SendAnswer {
    fn from(sent: Result<(), SendRefusal>) -> Self {
        match sent {
            Ok(()) => Self {
                sent: true,
                reason: None,
            },
            Err(reason) => Self {
                sent: false,
                reason: Some(reason),
            },
        }
    }
}

/// Checks a message before it is sealed: its size first, in UTF-8 bytes,
/// before any parsing; then that it is one JSON object, with nothing after
/// it, whose only `type` key is one of the phone's six messages.
pub(crate) fn check_message(text: &str) -> Result<(), SendRefusal> {
    if text.len() > GATEWAY_MAX_MESSAGE_BYTES {
        return Err(SendRefusal::TooLarge);
    }
    let MessageType(kind) =
        serde_json::from_str::<MessageType>(text).map_err(|_| SendRefusal::NotAllowed)?;
    if PHONE_MESSAGE_TYPES.contains(&kind.as_str()) {
        Ok(())
    } else {
        Err(SendRefusal::NotAllowed)
    }
}

/// The `type` of a JSON object. Reading fails on anything but an object,
/// on a `type` that isn't a string, on a missing `type`, and on a second
/// `type` key, which a parser that keeps the last one would read
/// differently.
struct MessageType(String);

impl<'de> Deserialize<'de> for MessageType {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_map(MessageTypeVisitor)
    }
}

struct MessageTypeVisitor;

impl<'de> Visitor<'de> for MessageTypeVisitor {
    type Value = MessageType;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a JSON object with one string `type`")
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<MessageType, A::Error> {
        let mut kind = None;
        // Keys are read unescaped, so `"\u0074ype"` counts as `type`, as it
        // does for the host's parser.
        while let Some(key) = map.next_key::<String>()? {
            if key != "type" {
                map.next_value::<IgnoredAny>()?;
                continue;
            }
            if kind.is_some() {
                return Err(de::Error::duplicate_field("type"));
            }
            kind = Some(map.next_value::<String>()?);
        }
        kind.map(MessageType)
            .ok_or_else(|| de::Error::missing_field("type"))
    }
}
