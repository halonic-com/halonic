//! What the page may ask an owner server for once signed in (HAL-20105): a
//! route from a fixed list, by name, with a run id the shell checks itself.
//! The call goes only to the origin the session was kept for, with the
//! session added here; the page never names a path, a host or a header.

use halonic_run_store::is_run_id;
use halonic_secrets::SecretBackend;

use crate::answer::OwnerError;
use crate::flow::{owner_origin, read_stored};
use crate::stored::{SESSION_COOKIE, session_name};

/// A route of an owner server the page may call. Only reads: an answer to a
/// run goes by answer handle, which comes with the run view (RO-4).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeploymentRoute {
    /// `GET /api/waiting-runs`.
    WaitingRuns,
    /// `GET /api/runs/{run}`.
    Run,
    /// `GET /api/runs/{run}/events`, server-sent events. A resumed stream
    /// sends the last event id it has as `Last-Event-ID`.
    RunEvents,
}

impl DeploymentRoute {
    /// The route the page names, by the name the page's table gives it.
    pub fn named(name: &str) -> Option<Self> {
        match name {
            "GET /api/waiting-runs" => Some(Self::WaitingRuns),
            "GET /api/runs/{run}" => Some(Self::Run),
            "GET /api/runs/{run}/events" => Some(Self::RunEvents),
            _ => None,
        }
    }

    /// Whether the route answers with server-sent events.
    pub fn streams(self) -> bool {
        self == Self::RunEvents
    }

    /// The route's path with `run`, which only the run routes take, and
    /// only when it is a run id: anything else is refused, never encoded.
    ///
    /// # Errors
    ///
    /// [`CallRefusal::BadRun`] when the run is missing, not a run id, or
    /// given to a route that takes none.
    pub fn path(self, run: Option<&str>) -> Result<String, CallRefusal> {
        match (self, run) {
            (Self::WaitingRuns, None) => Ok("/api/waiting-runs".to_owned()),
            (Self::Run, Some(run)) if is_run_id(run) => Ok(format!("/api/runs/{run}")),
            (Self::RunEvents, Some(run)) if is_run_id(run) => Ok(format!("/api/runs/{run}/events")),
            _ => Err(CallRefusal::BadRun),
        }
    }
}

/// Why the shell made no call, or didn't pass the answer on. It never
/// repeats what the page sent, the origin, the session or the address.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CallRefusal {
    /// The page named a route that isn't on the list.
    UnknownRoute,
    /// The run is missing, isn't a run id, or the route takes none.
    BadRun,
    /// The shell keeps no session for that origin.
    NotSignedIn,
    /// The server answered with a redirect, which the shell never follows.
    Redirected,
    /// The origin, the lookup, the connection or the keychain failed.
    Owner(OwnerError),
}

impl CallRefusal {
    /// The code the page reads, such as `unknownRoute` or, for an
    /// [`OwnerError`], that error's own code, such as `notHttps`.
    pub fn code(self) -> String {
        let code = match self {
            Self::UnknownRoute => "unknownRoute",
            Self::BadRun => "badRun",
            Self::NotSignedIn => "notSignedIn",
            Self::Redirected => "redirected",
            Self::Owner(code) => {
                return serde_json::to_value(code)
                    .ok()
                    .and_then(|value| value.as_str().map(str::to_owned))
                    .unwrap_or_else(|| "keychain".to_owned());
            }
        };
        code.to_owned()
    }
}

impl From<OwnerError> for CallRefusal {
    fn from(code: OwnerError) -> Self {
        Self::Owner(code)
    }
}

/// The origin in [`owner_origin`]'s form and the `Cookie` header of the
/// session the shell keeps for it.
///
/// # Errors
///
/// [`CallRefusal::NotSignedIn`] when there is no session for exactly that
/// origin, or the origin's or the keychain's error.
pub fn session_for(
    keychain: &dyn SecretBackend,
    origin: &str,
) -> Result<(String, String), CallRefusal> {
    let origin = owner_origin(origin)?;
    let name = session_name(&origin).map_err(|_| OwnerError::Keychain)?;
    let value = keychain
        .get(&name)
        .map_err(|_| OwnerError::Keychain)?
        .ok_or(CallRefusal::NotSignedIn)?;
    let stored = read_stored(&value, &origin).ok_or(CallRefusal::NotSignedIn)?;
    let cookie = format!("{SESSION_COOKIE}={}", stored.session);
    Ok((origin, cookie))
}

/// Refuses a redirect: the shell follows none, and passing one on would hand
/// the page an address the session might be sent to next.
///
/// # Errors
///
/// [`CallRefusal::Redirected`] for a 3xx status.
pub fn not_redirected(status: u16) -> Result<u16, CallRefusal> {
    if (300..400).contains(&status) {
        Err(CallRefusal::Redirected)
    } else {
        Ok(status)
    }
}

#[cfg(test)]
#[path = "calls_tests.rs"]
mod tests;
