//! Where the phone reaches the gateway (requirement `gateway-endpoint`): an
//! endpoint from a pairing, `wss:` or `https:` for WebSocket over TLS, and
//! `tcp:` for WebSocket over a plain TCP stream that carries only the
//! end-to-end session. Plain `ws:` and `http:` are never given.

/// The path the gateway takes a WebSocket on (`gatewayPath` on the host).
pub const GATEWAY_PATH: &str = "/v1/gateway";

/// The port of a TLS endpoint that names none.
const TLS_DEFAULT_PORT: u16 = 443;

/// A checked endpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoint {
    secure: bool,
    /// A name or an IP address, without the brackets of an IPv6 address.
    host: String,
    port: u16,
}

impl Endpoint {
    /// Reads an endpoint URL: a scheme (`wss:`, `https:` or `tcp:`), an
    /// optional `//`, a host and a port, and at most a trailing `/`. A `tcp:`
    /// endpoint must name its port. `None` for anything else, such as a
    /// path, a query, user info or another scheme.
    pub fn parse(url: &str) -> Option<Self> {
        let (scheme, rest) = url.split_once(':')?;
        let secure = match scheme.to_ascii_lowercase().as_str() {
            "wss" | "https" => true,
            "tcp" => false,
            _ => return None,
        };
        let rest = rest.strip_prefix("//").unwrap_or(rest);
        let authority = rest.strip_suffix('/').unwrap_or(rest);
        let (host, port) = split_host_port(authority)?;
        let port = match (port, secure) {
            (Some(port), _) => port,
            (None, true) => TLS_DEFAULT_PORT,
            (None, false) => return None,
        };
        Some(Self {
            secure,
            host: host.to_owned(),
            port,
        })
    }

    /// Whether the WebSocket runs over TLS.
    pub fn is_secure(&self) -> bool {
        self.secure
    }

    /// The host name or IP address, to connect to and to check TLS against.
    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// The WebSocket URL of the gateway at this endpoint. Its scheme only
    /// names the protocol to the handshake: the transport makes the TLS
    /// connection itself.
    pub fn websocket_url(&self) -> String {
        let scheme = if self.secure { "wss" } else { "ws" };
        let host = if self.host.contains(':') {
            format!("[{}]", self.host)
        } else {
            self.host.clone()
        };
        format!("{scheme}://{host}:{}{GATEWAY_PATH}", self.port)
    }
}

/// Splits `host[:port]` or `[ipv6][:port]`. `None` when the host is empty
/// or holds a character a host never has, or the port isn't 1 to 65535.
fn split_host_port(authority: &str) -> Option<(&str, Option<u16>)> {
    let (host, port) = if let Some(rest) = authority.strip_prefix('[') {
        let (host, after) = rest.split_once(']')?;
        if !host.contains(':') {
            return None;
        }
        match after {
            "" => (host, None),
            _ => (host, Some(after.strip_prefix(':')?)),
        }
    } else {
        match authority.split_once(':') {
            Some((host, port)) => (host, Some(port)),
            None => (authority, None),
        }
    };
    let allowed = |c: char| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':');
    if host.is_empty() || !host.chars().all(allowed) {
        return None;
    }
    let port = match port {
        Some(port) => Some(read_port(port)?),
        None => None,
    };
    Some((host, port))
}

fn read_port(text: &str) -> Option<u16> {
    let digits_only = !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit());
    let port = text.parse::<u16>().ok().filter(|_| digits_only)?;
    (port != 0).then_some(port)
}
