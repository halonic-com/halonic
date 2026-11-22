//! The agent host's secrets channel: the one way the host asks the shell for
//! something (requirement `host-secrets-channel`, plan on HAL-14090). The
//! host runs as a separate Node process, inside WSL on Windows, so it can't
//! reach the OS keychain; the shell can. After its handshake the host sends
//! one request at a time on connection id 0, which the relay never gives a
//! client, and the shell answers each on the same id:
//!
//! ```text
//! {"op":"get","name":"remote_host_key"}            → {"ok":true,"value":"…"}, or null when none is stored
//! {"op":"set","name":"remote_host_key","value":"…"} → {"ok":true,"value":null}
//! {"op":"delete","name":"remote_host_key"}         → {"ok":true,"value":null}
//! any of them when the keychain fails              → {"ok":false,"kind":"unavailable","message":"…"}
//! ```
//!
//! Only the names in [`halonic_secrets::HOST_NAMES`] are reachable. A request
//! that isn't one of these, or names anything else, is [`Refused`], and the
//! caller closes the channel: a host that sends one is broken or taken over,
//! and nothing it sends after that is trusted. No value is ever logged; the
//! request type has no `Debug`, so none can be printed by mistake.

use halonic_secrets::{
    SecretBackend, SecretError, delete_host_secret, get_host_secret, set_host_secret,
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::relay::FRAME_LIMIT;

/// The connection id the host's secret requests and their answers travel on.
pub(crate) const HOST_SECRETS_ID: u32 = 0;

/// A request the shell doesn't answer, so the channel closes. It says only
/// what was wrong, never the request's bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Refused {
    /// Not a request: not JSON, an unknown `op`, a missing or extra field.
    Malformed,
    /// A name the host may not reach, or no valid name at all.
    Name,
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "lowercase", deny_unknown_fields)]
enum Request {
    Get { name: String },
    Set { name: String, value: String },
    Delete { name: String },
}

/// Answers one request from the host with `backend`.
///
/// # Errors
///
/// [`Refused`] when the request is malformed or names anything but one of
/// the host's own secrets. The backend doesn't run then.
pub(crate) fn answer(backend: &dyn SecretBackend, request: &[u8]) -> Result<Vec<u8>, Refused> {
    let request: Request = serde_json::from_slice(request).map_err(|_| Refused::Malformed)?;
    let outcome = match request {
        Request::Get { name } => get_host_secret(backend, &name),
        Request::Set { name, value } => set_host_secret(backend, &name, &value).map(|()| None),
        Request::Delete { name } => delete_host_secret(backend, &name).map(|()| None),
    };
    let answer = match outcome {
        // The host's reader takes no larger frame; a value the host stored
        // through this channel is never that long, even escaped.
        Ok(Some(value)) if value.len() * 6 > FRAME_LIMIT => failed(&SecretError::InvalidValue),
        Ok(value) => json!({ "ok": true, "value": value }),
        Err(SecretError::InvalidName | SecretError::ReservedName) => return Err(Refused::Name),
        Err(error) => failed(&error),
    };
    Ok(answer.to_string().into_bytes())
}

/// The answer to a request the keychain couldn't carry out. Its message
/// never holds the value (`SecretError`'s rule).
fn failed(error: &SecretError) -> Value {
    json!({ "ok": false, "kind": error.kind(), "message": error.to_string() })
}

#[cfg(test)]
mod tests;
