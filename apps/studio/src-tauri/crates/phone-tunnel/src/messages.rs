//! The gateway messages the page sends through the tunnel (D7a,
//! HAL-15177; the D7 design on HAL-15159, section 1, and Julian's L1 on
//! HAL-15181). The shell checks each one before sealing it and sends
//! nothing when a check fails.
//!
//! It reads each message's keys as strictly as the host does, so the two
//! can't read one message two ways (Julian's condition 1 on HAL-15212): no
//! key twice, and exactly the keys of one of the phone's messages. An
//! `answer-approval` also gives its `decision`, which the owner check asks
//! the person to confirm (HAL-15194); a `msg-answer` (message version 4,
//! HAL-17634) is always confirmed too. The host's own parser stays the
//! authority on every other value.

use std::collections::BTreeSet;
use std::fmt;

use halonic_owner_check::Decision;
use halonic_tunnel::MAX_MESSAGE_BYTES;
use serde::de::{self, Deserializer, IgnoredAny, MapAccess, Visitor};
use serde::{Deserialize, Serialize};

/// The largest message the page may send, in UTF-8 bytes: what one
/// transport message holds after its tag, the host's
/// `gatewayMaxMessageBytes` (65,519).
pub const GATEWAY_MAX_MESSAGE_BYTES: usize = MAX_MESSAGE_BYTES;

/// The fourteen messages a phone may send (`ports.remote-gateway-protocol`,
/// message version 5).
pub const PHONE_MESSAGE_TYPES: [&str; 14] = [
    "hello",
    "list-sessions",
    "watch",
    "unwatch",
    ANSWER_APPROVAL,
    "prompt",
    "msg-read",
    "msg-search",
    MSG_ANSWER,
    "msg-send",
    "msg-react",
    "msg-watch",
    "msg-unwatch",
    "team-read",
];

const ANSWER_APPROVAL: &str = "answer-approval";
const MSG_ANSWER: &str = "msg-answer";

/// The keys a phone message must have besides `type`, and the ones it may
/// have.
struct Keys {
    required: &'static [&'static str],
    optional: &'static [&'static str],
}

const fn required(keys: &'static [&'static str]) -> Keys {
    Keys {
        required: keys,
        optional: &[],
    }
}

/// The keys of each phone message, as the host's
/// `parseGatewayClientMessage` checks them, in [`PHONE_MESSAGE_TYPES`]
/// order. `msg-read` and `team-read` take a different key set for each
/// `what`; the host checks which goes with which, so this allows their union.
const MESSAGE_KEYS: [(&str, Keys); 14] = [
    ("hello", required(&["id", "version"])),
    ("list-sessions", required(&["id"])),
    ("watch", required(&["id", "sessionId", "afterSeq"])),
    ("unwatch", required(&["id", "sessionId"])),
    (
        ANSWER_APPROVAL,
        required(&["id", "sessionId", "approvalId", "decision"]),
    ),
    ("prompt", required(&["id", "sessionId", "text"])),
    (
        "msg-read",
        Keys {
            required: &["id", "what"],
            optional: &["cursor", "conversation", "before"],
        },
    ),
    ("msg-search", required(&["id", "text"])),
    (MSG_ANSWER, required(&["id", "item", "answer", "confirmed"])),
    (
        "msg-send",
        Keys {
            required: &["id", "conversation", "body"],
            optional: &["to"],
        },
    ),
    // A reaction isn't an answer and wakes nobody, so it needs no owner
    // check (message version 5, HAL-20259).
    (
        "msg-react",
        required(&["id", "conversation", "message", "emoji", "on"]),
    ),
    ("msg-watch", required(&["id"])),
    ("msg-unwatch", required(&["id"])),
    (
        "team-read",
        Keys {
            required: &["id", "what"],
            optional: &["range", "pullRequest"],
        },
    ),
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
    /// Not exactly one JSON object, with no key twice, holding exactly the
    /// keys of a message a phone may send.
    NotAllowed,
    /// An answer to an approval whose owner check didn't pass, or a phone
    /// that can't check its owner (board decision 4b).
    NotConfirmed,
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

/// A message that passed [`check_message`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CheckedMessage {
    /// Goes out as it is.
    Plain,
    /// An `answer-approval` or a `msg-answer`: goes out only after the
    /// owner confirms this decision.
    Answer(Decision),
}

/// Checks a message before it is sealed: its size first, in UTF-8 bytes,
/// before any parsing; then that it is one JSON object, with nothing after
/// it and no key twice, whose `type` is one of the phone's messages and
/// whose other keys are all of that message's required keys and only its
/// own. An `answer-approval`'s `decision` must be `approve` or `deny`.
pub(crate) fn check_message(text: &str) -> Result<CheckedMessage, SendRefusal> {
    if text.len() > GATEWAY_MAX_MESSAGE_BYTES {
        return Err(SendRefusal::TooLarge);
    }
    let read = serde_json::from_str::<MessageKeys>(text).map_err(|_| SendRefusal::NotAllowed)?;
    let (_, expected) = MESSAGE_KEYS
        .iter()
        .find(|(kind, _)| *kind == read.kind)
        .ok_or(SendRefusal::NotAllowed)?;
    let has_required = expected.required.iter().all(|key| read.keys.contains(*key));
    let only_listed = read.keys.iter().all(|key| {
        expected.required.contains(&key.as_str()) || expected.optional.contains(&key.as_str())
    });
    if !has_required || !only_listed {
        return Err(SendRefusal::NotAllowed);
    }
    if read.kind == MSG_ANSWER {
        return Ok(CheckedMessage::Answer(Decision::Answer));
    }
    if read.kind != ANSWER_APPROVAL {
        return Ok(CheckedMessage::Plain);
    }
    match read.decision.as_deref() {
        Some("approve") => Ok(CheckedMessage::Answer(Decision::Approve)),
        Some("deny") => Ok(CheckedMessage::Answer(Decision::Deny)),
        _ => Err(SendRefusal::NotAllowed),
    }
}

/// What [`check_message`] reads of a JSON object: its string `type`, its
/// other keys, and its `decision` when that is a string. Reading fails on
/// anything but an object, on a `type` that isn't a string, on a missing
/// `type`, and on any key that comes twice, which a parser that keeps the
/// last one (the host's `JSON.parse`) would read differently.
struct MessageKeys {
    kind: String,
    keys: BTreeSet<String>,
    decision: Option<String>,
}

impl<'de> Deserialize<'de> for MessageKeys {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_map(MessageKeysVisitor)
    }
}

struct MessageKeysVisitor;

impl<'de> Visitor<'de> for MessageKeysVisitor {
    type Value = MessageKeys;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a JSON object with one string `type` and no key twice")
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<MessageKeys, A::Error> {
        let mut kind = None;
        let mut keys = BTreeSet::new();
        let mut decision = None;
        // Keys are read unescaped, so `"\u0074ype"` counts as `type`, as it
        // does for the host's parser.
        while let Some(key) = map.next_key::<String>()? {
            if key == "type" {
                if kind.is_some() {
                    return Err(de::Error::duplicate_field("type"));
                }
                kind = Some(map.next_value::<String>()?);
                continue;
            }
            if keys.contains(&key) {
                return Err(de::Error::custom("a key comes twice"));
            }
            if key == "decision" {
                if let serde_json::Value::String(text) = map.next_value::<serde_json::Value>()? {
                    decision = Some(text);
                }
            } else {
                map.next_value::<IgnoredAny>()?;
            }
            keys.insert(key);
        }
        let kind = kind.ok_or_else(|| de::Error::missing_field("type"))?;
        Ok(MessageKeys {
            kind,
            keys,
            decision,
        })
    }
}
