//! What each phone tunnel command answers, as the page sees it. Every
//! answer is an object tagged by `kind`, and every failure is a
//! [`Problem`], never a raw message (rule 4 of HAL-15157). No answer holds
//! a private key, a session key, the pairing code or its psk: only the
//! check code, computer names, ids, endpoints, times and states.

use halonic_device_keys::{ComputerDetails, DeviceKeyError, PairedComputer, Standing};
use halonic_tunnel::{PairRefusedReason, PairingProblem, SessionError};
use serde::{Serialize, Serializer};

use crate::status::Reason;

/// Why a command couldn't do what it was asked.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum Problem {
    /// The typed code didn't match; 1 to 4 tries are left.
    WrongCode {
        tries_left: u8,
    },
    /// The code ran out, had its fifth wrong try or its dialog was closed;
    /// or the page cancelled the pairing, or started another.
    CodeEnded,
    /// Another phone used the code first.
    CodeUsed,
    /// The computer has had too many failed tries this minute.
    RateLimited,
    /// Don't allow was pressed on the computer.
    Denied,
    /// Allow wasn't pressed in time.
    TimedOut,
    /// The computer that answered isn't the one in the QR code.
    HandshakeFailed,
    CantReach {
        reason: Reason,
    },
    /// Android's local network permission is turned down; `ask_again`
    /// says whether Android will ask on the next try.
    NoLocalNetwork {
        ask_again: bool,
    },
    /// The computer sent something the phone can't read.
    Unreadable,
    /// The page sent a code or a QR code's key that isn't one: a bug in
    /// the page, which it logs, not something the person can fix.
    BadStart,
    /// The computer isn't listed, or it has removed this phone.
    NotPaired,
    /// The phone's key for the computer no longer opens: pair again.
    KeyUnreadable,
    /// The phone's key store failed.
    KeysUnavailable,
}

impl From<PairingProblem> for Problem {
    fn from(problem: PairingProblem) -> Self {
        match problem {
            PairingProblem::CantReach(error) => Self::CantReach {
                reason: error.into(),
            },
            PairingProblem::Session(error) => Self::from_session(error),
            PairingProblem::Denied => Self::Denied,
            PairingProblem::TimedOut => Self::TimedOut,
        }
    }
}

impl Problem {
    fn from_session(error: SessionError) -> Self {
        match error {
            SessionError::PairRefused { reason, tries_left } => match reason {
                // The host ends the code on its fifth wrong try.
                PairRefusedReason::WrongCode if tries_left == 0 => Self::CodeEnded,
                PairRefusedReason::WrongCode => Self::WrongCode { tries_left },
                PairRefusedReason::CodeEnded => Self::CodeEnded,
                PairRefusedReason::CodeUsed => Self::CodeUsed,
                PairRefusedReason::RateLimited => Self::RateLimited,
            },
            SessionError::CantConfirm => Self::HandshakeFailed,
            _ => Self::Unreadable,
        }
    }
}

impl From<DeviceKeyError> for Problem {
    fn from(error: DeviceKeyError) -> Self {
        match error {
            DeviceKeyError::InvalidComputer => Self::NotPaired,
            DeviceKeyError::Unreadable => Self::KeyUnreadable,
            DeviceKeyError::Unavailable | DeviceKeyError::Storage { .. } => Self::KeysUnavailable,
        }
    }
}

/// Where the phone stands with a listed computer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum StandingView {
    Paired,
    CantConfirm,
    Removed,
    /// Its details can't be read; it is listed so it can be forgotten.
    Unreadable,
}

/// A listed computer. Nothing secret: no key, and not the pinned key
/// either, though only its owner's computer could use that.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputerView {
    pub id: String,
    pub standing: StandingView,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// The endpoints the phone paired through, the latest first.
    pub endpoints: Vec<String>,
    /// Milliseconds since the Unix epoch.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paired_at_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_connected_at_ms: Option<u64>,
}

impl From<&PairedComputer> for ComputerView {
    fn from(computer: &PairedComputer) -> Self {
        let id = computer.id.as_str().to_owned();
        match &computer.details {
            Some(details) => Self::listed(id, details),
            None => Self {
                id,
                standing: StandingView::Unreadable,
                name: None,
                endpoints: Vec::new(),
                paired_at_ms: None,
                last_connected_at_ms: None,
            },
        }
    }
}

impl ComputerView {
    fn listed(id: String, details: &ComputerDetails) -> Self {
        let standing = match details.standing {
            Standing::Paired { .. } => StandingView::Paired,
            Standing::CantConfirm { .. } => StandingView::CantConfirm,
            Standing::Removed => StandingView::Removed,
        };
        Self {
            id,
            standing,
            name: Some(details.name.clone()),
            endpoints: details.endpoints.clone(),
            paired_at_ms: Some(details.paired_at_ms),
            last_connected_at_ms: details.last_connected_at_ms,
        }
    }
}

/// What the answers say when nothing went wrong.
#[derive(Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
enum Done<'a> {
    Check {
        computer_name: &'a str,
        check_code: &'a str,
    },
    Paired {
        computer: &'a ComputerView,
    },
    Computers {
        computers: &'a [ComputerView],
    },
    Connecting,
    Forgotten,
}

/// The answer to starting a pairing: the check code both screens show, or
/// why it stopped. Messages 1 to 3 are done; the computer waits for Allow.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PairingStep {
    Check {
        computer_name: String,
        check_code: String,
    },
    Stopped(Problem),
}

/// The answer to waiting for Allow: the computer, now listed, or why not.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PairingOutcome {
    Paired(ComputerView),
    Stopped(Problem),
}

/// The listed computers, oldest pairing first.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ComputersAnswer {
    Computers(Vec<ComputerView>),
    Stopped(Problem),
}

/// The answer to connecting: the status follows on the page's channel.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectOutcome {
    Connecting,
    Stopped(Problem),
}

/// The answer to forgetting a computer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ForgetOutcome {
    Forgotten,
    Stopped(Problem),
}

impl Serialize for PairingStep {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Check {
                computer_name,
                check_code,
            } => Done::Check {
                computer_name,
                check_code,
            }
            .serialize(serializer),
            Self::Stopped(problem) => problem.serialize(serializer),
        }
    }
}

impl Serialize for PairingOutcome {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Paired(computer) => Done::Paired { computer }.serialize(serializer),
            Self::Stopped(problem) => problem.serialize(serializer),
        }
    }
}

impl Serialize for ComputersAnswer {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Computers(computers) => Done::Computers { computers }.serialize(serializer),
            Self::Stopped(problem) => problem.serialize(serializer),
        }
    }
}

impl Serialize for ConnectOutcome {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Connecting => Done::Connecting.serialize(serializer),
            Self::Stopped(problem) => problem.serialize(serializer),
        }
    }
}

impl Serialize for ForgetOutcome {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Forgotten => Done::Forgotten.serialize(serializer),
            Self::Stopped(problem) => problem.serialize(serializer),
        }
    }
}
