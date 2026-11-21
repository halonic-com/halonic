//! Why a call to the agent host was refused, as the page gets it.

use serde::Serialize;

use super::progress::{FailureCause, StartFailure};

/// Why a call didn't reach the host: `unknown_route`, `host_unavailable`,
/// `stream_in_use`, `stream_ended` or `io`, and a message for the log. A
/// `host_unavailable` for the WSL distro may carry a `reason`, one of the
/// sandbox reasons (`wsl-missing`, `distro-missing`), so Studio can show the
/// setup state without a running host to ask. The host's own refusals are
/// answers. No message contains the launch token.
#[derive(Debug, Serialize)]
pub struct HostRefusal {
    pub(super) kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) reason: Option<&'static str>,
    pub(super) message: String,
    /// Why the host didn't start, for `start_status`; never sent with the
    /// refusal.
    #[serde(skip)]
    pub(super) failure: StartFailure,
}

impl HostRefusal {
    pub(super) fn new(kind: &'static str, message: impl std::fmt::Display) -> Self {
        Self {
            kind,
            reason: None,
            message: message.to_string(),
            failure: StartFailure::of(FailureCause::Other),
        }
    }

    pub(super) fn with_reason(mut self, reason: &'static str) -> Self {
        self.reason = Some(reason);
        self
    }

    pub(super) fn with_failure(mut self, failure: StartFailure) -> Self {
        self.failure = failure;
        self
    }
}

pub(super) fn poisoned() -> HostRefusal {
    HostRefusal::new(
        "io",
        "the agent host's state was left broken by an earlier failure",
    )
}

pub(super) fn unavailable(error: impl std::fmt::Display) -> HostRefusal {
    HostRefusal::new("host_unavailable", error)
}
