//! The one line the agent host prints when it serves:
//! `{"url":"http://127.0.0.1:<port>","token":"<43 characters>"}`
//! (apps/agent-host/README.md, "Serving on loopback").

use serde::Deserialize;

use crate::AgentHostError;

/// Where the host serves and the token every request carries. The token
/// stays in the shell: `Debug` never shows it, and no error contains it.
#[derive(Clone, PartialEq, Eq)]
pub struct Handshake {
    url: String,
    token: String,
}

impl Handshake {
    /// The host's address, `http://127.0.0.1:<port>`, with no path.
    pub fn url(&self) -> &str {
        &self.url
    }

    /// The launch token, for the `Authorization: Bearer` header.
    pub fn token(&self) -> &str {
        &self.token
    }
}

impl std::fmt::Debug for Handshake {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("Handshake")
            .field("url", &self.url)
            .field("token", &"<hidden>")
            .finish()
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct HandshakeLine {
    url: String,
    token: String,
}

/// The token is 32 random bytes in base64url without padding.
const TOKEN_LENGTH: usize = 43;

/// Reads and checks the handshake line. Anything but a loopback address and
/// a well-formed token is refused, so the shell never sends the token to
/// another address. The error never repeats the line, which may hold a token.
///
/// # Errors
///
/// [`AgentHostError::Handshake`] naming what is wrong with the line.
pub fn read_handshake(line: &str) -> Result<Handshake, AgentHostError> {
    let parsed =
        read_object(line).ok_or_else(|| refused("it isn't {\"url\",\"token\"} as JSON"))?;
    if !is_loopback_url(&parsed.url) {
        return Err(refused("its url isn't http://127.0.0.1:<port>"));
    }
    if !is_token(&parsed.token) {
        return Err(refused("its token isn't 43 base64url characters"));
    }
    Ok(Handshake {
        url: parsed.url,
        token: parsed.token,
    })
}

/// The line as a JSON object with exactly `url` and `token`. Read as a value
/// first, because serde would also take `[url, token]` for the struct.
fn read_object(line: &str) -> Option<HandshakeLine> {
    let value: serde_json::Value = serde_json::from_str(line.trim_end()).ok()?;
    if !value.is_object() {
        return None;
    }
    serde_json::from_value(value).ok()
}

pub(crate) fn refused(why: &str) -> AgentHostError {
    AgentHostError::Handshake(format!("The agent host's handshake was refused: {why}."))
}

/// `http://127.0.0.1:<port>` with a port from 1 to 65535 written without
/// leading zeros, and nothing after it.
fn is_loopback_url(url: &str) -> bool {
    let Some(port) = url.strip_prefix("http://127.0.0.1:") else {
        return false;
    };
    let digits_only = !port.is_empty() && port.bytes().all(|byte| byte.is_ascii_digit());
    digits_only && !port.starts_with('0') && port.parse::<u16>().is_ok_and(|number| number > 0)
}

fn is_token(token: &str) -> bool {
    token.len() == TOKEN_LENGTH
        && token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}
