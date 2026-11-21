//! A paired computer's connection state as the phone's own page sees it:
//! the tunnel crate's `PhoneStatus`, with the time of the next try while
//! the phone is reconnecting.

use halonic_tunnel::{ConnectError, PhoneStatus};
use serde::Serialize;

/// Why a try to reach the computer failed, told apart only as far as the
/// phone can see it. `network-down` is only the phone's own network, never
/// a timeout.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Reason {
    NetworkDown,
    Timeout,
    Refused,
    Unreachable,
}

impl From<ConnectError> for Reason {
    fn from(error: ConnectError) -> Self {
        match error {
            ConnectError::NetworkDown => Self::NetworkDown,
            ConnectError::Timeout => Self::Timeout,
            ConnectError::Refused => Self::Refused,
            ConnectError::Unreachable => Self::Unreachable,
        }
    }
}

/// A paired computer's connection state, sent to the page as
/// `{ "state": "reconnecting", "lastTry": "timeout", "nextTryAtMs": … }`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(
    tag = "state",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum PageStatus {
    /// Connected and authenticated; waiting for the host's `welcome`.
    Connecting,
    Connected,
    /// The connection dropped and the phone is trying again.
    Reconnecting {
        /// Why the last try failed, once one has.
        #[serde(skip_serializing_if = "Option::is_none")]
        last_try: Option<Reason>,
        /// When the next try starts, in milliseconds since the Unix epoch,
        /// for "Trying again in N seconds". An absolute time, so a status
        /// sent again later still says the right thing.
        #[serde(skip_serializing_if = "Option::is_none")]
        next_try_at_ms: Option<u64>,
    },
    /// "Can't confirm your computer": another key answered. Nothing is
    /// cleared, and the phone keeps trying.
    CantConfirm,
    /// "Removed from this computer". The phone's key for it is already
    /// wiped when this is sent.
    Removed,
    /// The app is in the background.
    Paused,
    /// Disconnected by the page, or forgotten.
    Closed,
}

impl PageStatus {
    /// The page's form of a phone connection's status.
    pub fn from_phone(status: PhoneStatus) -> Self {
        match status {
            PhoneStatus::Connecting => Self::Connecting,
            PhoneStatus::Connected => Self::Connected,
            PhoneStatus::Reconnecting { last_try } => Self::Reconnecting {
                last_try: last_try.map(Reason::from),
                next_try_at_ms: None,
            },
            PhoneStatus::CantConfirm => Self::CantConfirm,
            PhoneStatus::Removed => Self::Removed,
            PhoneStatus::Paused => Self::Paused,
            PhoneStatus::Closed => Self::Closed,
        }
    }

    /// The same status with the next try at `at_ms`; `None` unless it is
    /// Reconnecting, since only then does a try wait.
    pub fn with_next_try(self, at_ms: u64) -> Option<Self> {
        match self {
            Self::Reconnecting { last_try, .. } => Some(Self::Reconnecting {
                last_try,
                next_try_at_ms: Some(at_ms),
            }),
            _ => None,
        }
    }
}
