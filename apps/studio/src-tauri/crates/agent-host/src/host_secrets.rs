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
//!
//! Every answer fits in one frame of [`FRAME_LIMIT`] bytes, the most the
//! host's reader takes. A `set` whose value couldn't be read back in one
//! answer is refused before the keychain runs, so what the host stores it
//! can always read; a stored value too long to answer (one the host didn't
//! store) is answered as `invalid_value`.

use halonic_secrets::{
    SecretBackend, SecretError, SecretName, delete_host_secret, get_host_secret, set_host_secret,
};
use serde::Deserialize;
use serde_json::json;

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
    let backend = AnswerableValues(backend);
    let outcome = match request {
        Request::Get { name } => get_host_secret(&backend, &name),
        Request::Set { name, value } => set_host_secret(&backend, &name, &value).map(|()| None),
        Request::Delete { name } => delete_host_secret(&backend, &name).map(|()| None),
    };
    let answer = match outcome {
        Ok(value) => succeeded(value.as_deref()),
        Err(SecretError::InvalidName | SecretError::ReservedName) => return Err(Refused::Name),
        Err(error) => failed(&error),
    };
    if answer.len() > FRAME_LIMIT {
        return Ok(failed(&SecretError::InvalidValue).into_bytes());
    }
    Ok(answer.into_bytes())
}

/// The answer to a request the keychain carried out, as sent.
fn succeeded(value: Option<&str>) -> String {
    json!({ "ok": true, "value": value }).to_string()
}

/// The answer to a request the keychain couldn't carry out, as sent. Its
/// message never holds the value (`SecretError`'s rule).
fn failed(error: &SecretError) -> String {
    json!({ "ok": false, "kind": error.kind(), "message": error.to_string() }).to_string()
}

/// The backend as the channel sees it: a value whose `get` answer wouldn't
/// fit in one frame is refused as `invalid_value` before it reaches the
/// keychain. JSON escaping can make a value up to six times longer, so the
/// answer itself is measured rather than the value. Wrapping the backend
/// keeps the order of `set_host_secret`: a name the host may not reach is
/// refused first, whatever the value.
struct AnswerableValues<'a>(&'a dyn SecretBackend);

impl SecretBackend for AnswerableValues<'_> {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.0.get(name)
    }
    fn has(&self, name: &SecretName) -> Result<bool, SecretError> {
        self.0.has(name)
    }
    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        if succeeded(Some(value)).len() > FRAME_LIMIT {
            return Err(SecretError::InvalidValue);
        }
        self.0.set(name, value)
    }
    fn delete(&self, name: &SecretName) -> Result<(), SecretError> {
        self.0.delete(name)
    }
    fn get_origins(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.0.get_origins(name)
    }
    fn set_origins(&self, name: &SecretName, origins: &str) -> Result<(), SecretError> {
        self.0.set_origins(name, origins)
    }
    fn delete_origins(&self, name: &SecretName) -> Result<(), SecretError> {
        self.0.delete_origins(name)
    }
    fn max_value_bytes(&self) -> usize {
        self.0.max_value_bytes()
    }
}

#[cfg(test)]
mod tests;
