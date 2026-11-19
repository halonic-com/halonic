//! The origins a stored key may be sent to (HAL-11887, the keychain side of
//! HAL-11871). The CLI keeps them next to the key in its secrets file; the
//! keychain keeps one entry per key, so a backend keeps them in a second
//! entry under the same canonical name ([`SecretBackend::get_origins`]).
//!
//! The list is stored as text, one origin per line. It is not a secret, but
//! it sits in the keychain so it lives and dies with its key and a page or a
//! workspace folder can't write it except through these functions.

use crate::backend::{SecretBackend, secret_name};
use crate::error::SecretError;

/// The most origins one key may be allowed to go to, as `maxAllowedOrigins`
/// in `@halonicjs/ports`. A short list on purpose: each one is a place the
/// key can leak to.
pub const MAX_ALLOWED_ORIGINS: usize = 8;

/// What [`allow_origin`] did. A failure to reach the keychain is an error;
/// these are the expected outcomes, as `AddOriginResult` in
/// `@halonicjs/adapter-secrets-file`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AllowOrigin {
    /// The origin was added to the key's list.
    Added,
    /// The origin was already on the list; nothing was written.
    AlreadyAllowed,
    /// No key is stored under the name; nothing was written.
    NoKey,
    /// The list holds [`MAX_ALLOWED_ORIGINS`], or one more wouldn't fit in
    /// the backend's entry; nothing was written.
    Full,
}

/// What the `secret_allowed_origins` command does: checks the name, then
/// reads the key's origins. `None` when the key has none recorded, which the
/// model resolver treats by the older trust rule.
///
/// A list that isn't one this crate wrote (empty lines, repeats, too many) is
/// refused with `backend`, never read as `None`: that would unbind the key.
pub fn allowed_origins(
    backend: &dyn SecretBackend,
    name: &str,
) -> Result<Option<Vec<String>>, SecretError> {
    let name = secret_name(name)?;
    backend
        .get_origins(&name)?
        .map(|stored| parse_origins(&stored))
        .transpose()
}

/// What the `secret_allow_origin` command does: checks the name, then adds
/// `origin` to the origins of the key stored under it, keeping the others.
///
/// `origin` must already be an origin as `new URL(…).origin` writes it; the
/// shell makes it from the address the page sent. This function only refuses
/// one that can't be a line of the list.
///
/// The read and the write are two keychain calls, so the caller runs every
/// change to a key and its origins one at a time.
pub fn allow_origin(
    backend: &dyn SecretBackend,
    name: &str,
    origin: &str,
) -> Result<AllowOrigin, SecretError> {
    let name = secret_name(name)?;
    if !is_origin_line(origin) {
        return Err(SecretError::InvalidValue);
    }
    if !backend.has(&name)? {
        return Ok(AllowOrigin::NoKey);
    }
    let mut origins = match backend.get_origins(&name)? {
        Some(stored) => parse_origins(&stored)?,
        None => Vec::new(),
    };
    if origins.iter().any(|allowed| allowed == origin) {
        return Ok(AllowOrigin::AlreadyAllowed);
    }
    if origins.len() >= MAX_ALLOWED_ORIGINS {
        return Ok(AllowOrigin::Full);
    }
    origins.push(origin.to_owned());
    let stored = origins.join("\n");
    if stored.len() > backend.max_value_bytes() {
        return Ok(AllowOrigin::Full);
    }
    backend.set_origins(&name, &stored)?;
    Ok(AllowOrigin::Added)
}

/// The list as stored, or `backend` when it isn't one [`allow_origin`]
/// writes. The message names no origin.
fn parse_origins(stored: &str) -> Result<Vec<String>, SecretError> {
    let origins: Vec<String> = stored.split('\n').map(str::to_owned).collect();
    let mut seen = std::collections::HashSet::new();
    let well_formed = origins.len() <= MAX_ALLOWED_ORIGINS
        && origins
            .iter()
            .all(|origin| is_origin_line(origin) && seen.insert(origin.as_str()));
    if !well_formed {
        return Err(SecretError::Backend {
            message: "the key's allowed origins are not a list Halonic wrote".to_owned(),
        });
    }
    Ok(origins)
}

/// Whether `origin` can be one line of the stored list: not empty, and only
/// the printable ASCII an origin's serialization has (hosts are in Punycode).
fn is_origin_line(origin: &str) -> bool {
    !origin.is_empty() && origin.bytes().all(|byte| byte.is_ascii_graphic())
}
