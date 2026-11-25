//! The session an owner server sets, and how the shell keeps it: one
//! keychain entry per origin, holding the session and when it was signed in.

use halonic_secrets::{SecretError, SecretName};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// The session cookie an owner server sets over `https` (`__Host-` keeps a
/// browser's copy to the exact host). Only this name is read.
pub const SESSION_COOKIE: &str = "__Host-halonic-session";

/// The most of a session token the shell keeps. The server's are 64 hex
/// digits; anything far longer isn't one of its sessions.
const MAX_SESSION_BYTES: usize = 512;

/// The session in the `Set-Cookie` values of a sign-in answer, or `None`
/// when none of them sets [`SESSION_COOKIE`] to a token. The attributes are
/// the server's own, so only the name and the value are read.
pub fn session_from_set_cookie<'a>(values: impl IntoIterator<Item = &'a str>) -> Option<String> {
    values.into_iter().find_map(|value| {
        let pair = value.split(';').next()?.trim();
        let token = pair.strip_prefix(SESSION_COOKIE)?.strip_prefix('=')?;
        let is_token = !token.is_empty()
            && token.len() <= MAX_SESSION_BYTES
            && token
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"-_.~".contains(&byte));
        is_token.then(|| token.to_owned())
    })
}

/// What one keychain entry holds. `origin` is checked on every read, so an
/// entry is only ever used for the server it was made for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredSession {
    pub origin: String,
    pub session: String,
    /// Seconds since 1970 when the shell signed in.
    pub signed_in_at: u64,
}

/// The keychain name of `origin`'s session: the reserved owner-session
/// prefix and the first 16 bytes of the origin's SHA-256, in hex.
pub(crate) fn session_name(origin: &str) -> Result<SecretName, SecretError> {
    let digest = Sha256::digest(origin.as_bytes());
    let key: String = digest[..16]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    SecretName::owner_session(&key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owner_sign_in_commands_read_only_the_session_cookie() {
        let cookie = "0123456789abcdef".repeat(4);
        let set = format!("{SESSION_COOKIE}={cookie}; Path=/; Secure; HttpOnly; SameSite=Strict");
        let other = "tracking=abc; Path=/";
        assert_eq!(session_from_set_cookie([other, set.as_str()]), Some(cookie));
        assert_eq!(session_from_set_cookie([other]), None);
        for value in [
            format!("{SESSION_COOKIE}=; Max-Age=0"),
            "halonic-session=abc; Path=/".to_owned(),
            format!("{SESSION_COOKIE}x=abc"),
            format!("{SESSION_COOKIE}=a b"),
            format!("{SESSION_COOKIE}={}", "a".repeat(MAX_SESSION_BYTES + 1)),
        ] {
            assert_eq!(session_from_set_cookie([value.as_str()]), None, "{value}");
        }
    }

    #[test]
    fn owner_sign_in_commands_keep_one_entry_per_origin() {
        let first = session_name("https://halonic.example:443").expect("a name");
        let again = session_name("https://halonic.example:443").expect("a name");
        let other = session_name("https://halonic.example:8443").expect("a name");
        assert_eq!(first, again);
        assert_ne!(first, other);
        assert!(first.as_str().starts_with("owner_session__"));
        assert!(first.is_halonic());
    }
}
