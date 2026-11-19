//! Which calls go through the proxy `HTTPS_PROXY` names (HAL-12966).
//!
//! The rules are the CLI's (`packages/adapters/http-node`, requirements
//! `http-node.proxy-config` and `http-node.proxy-guard`), so the CLI and
//! Studio send the same calls through the proxy. Both test against the
//! vectors in `packages/adapters/http-node/test-vectors/proxy-rules.json`.

use std::fmt;

use url::{Host, Url};

use crate::address::is_local;
use crate::no_proxy::NoProxy;
use crate::request::Refusal;

/// What the environment says about a proxy. Read once, when the app starts.
#[derive(Debug, Clone)]
pub enum ProxySetting {
    /// No proxy: every call goes direct.
    None,
    /// A usable proxy, and the hosts that skip it.
    Proxy {
        endpoint: ProxyEndpoint,
        no_proxy: NoProxy,
    },
    /// A proxy that is set but unusable, and why. Every call that would use
    /// it fails with that message; none goes direct instead.
    Refused(String),
}

impl ProxySetting {
    /// Reads `HTTPS_PROXY` and `NO_PROXY` through `var`. The lower-case name
    /// wins, as in curl. An empty value counts as not set, so `https_proxy=`
    /// switches a proxy off for one shell and falls back to `HTTPS_PROXY`.
    /// `HTTP_PROXY` and `ALL_PROXY` are not read: only `https` is tunnelled.
    pub fn from_env(var: impl Fn(&str) -> Option<String>) -> Self {
        let first_set = |names: [&str; 2]| {
            names.into_iter().find_map(|name| {
                var(name)
                    .map(|value| value.trim().to_owned())
                    .filter(|value| !value.is_empty())
            })
        };
        let Some(value) = first_set(["https_proxy", "HTTPS_PROXY"]) else {
            return Self::None;
        };
        match ProxyEndpoint::parse(&value) {
            Ok(endpoint) => Self::Proxy {
                endpoint,
                no_proxy: NoProxy::parse(&first_set(["no_proxy", "NO_PROXY"]).unwrap_or_default()),
            },
            Err(message) => Self::Refused(message),
        }
    }
}

/// How one call, or one redirect hop, reaches its host.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route<'a> {
    /// Straight to the host's checked addresses.
    Direct,
    /// Through a CONNECT tunnel to the host's name, made by the proxy.
    Tunnel(&'a ProxyEndpoint),
}

/// Decides, by the host's name, whether a call goes through the proxy.
///
/// - `localhost`, or a loopback or private-network address written as the
///   host, is always direct, with the full address check. Sending a
///   home-network host to a company proxy would leak it.
/// - A host on `NO_PROXY` is direct, with the full address check.
/// - Any other host counts as public: it goes through a CONNECT tunnel over
///   `https`, or fails. A plain `http` call, or an unusable proxy setting, is
///   refused and never sent direct, which would walk around the company's
///   egress rules.
///
/// # Errors
///
/// A [`Refusal`] with code `proxy_refused` or `plain_http_proxied`.
pub fn route_for<'a>(url: &Url, setting: &'a ProxySetting) -> Result<Route<'a>, Refusal> {
    let (endpoint, no_proxy) = match setting {
        ProxySetting::None => return Ok(Route::Direct),
        _ if is_local_by_name(url) => return Ok(Route::Direct),
        ProxySetting::Refused(message) => {
            return Err(Refusal::new(
                "proxy_refused",
                format!("{message} Nothing was sent."),
            ));
        }
        ProxySetting::Proxy { endpoint, no_proxy } => (endpoint, no_proxy),
    };
    if no_proxy.matches(url) {
        return Ok(Route::Direct);
    }
    if url.scheme() != "https" {
        return Err(Refusal::new(
            "plain_http_proxied",
            "the host uses plain http and a proxy is set, so nothing was sent. Use https://, or add the host to NO_PROXY.",
        ));
    }
    Ok(Route::Tunnel(endpoint))
}

/// The CLI's host class by name (`connectorHostClass`): `localhost` and a
/// loopback or private address are local; every other name is public.
fn is_local_by_name(url: &Url) -> bool {
    match url.host() {
        Some(Host::Domain(name)) => name.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(ip)) => is_local(ip.into()),
        Some(Host::Ipv6(ip)) => is_local(ip.into()),
        None => false,
    }
}

/// The `http://` proxy calls go through. The user name and password are
/// private: printing the endpoint shows `http://host:port` only.
#[derive(Clone, PartialEq, Eq)]
pub struct ProxyEndpoint {
    /// As the URL writes it: lower case, IPv6 in brackets.
    host: String,
    port: u16,
    credentials: Option<Credentials>,
}

#[derive(Clone, PartialEq, Eq)]
struct Credentials {
    username: String,
    password: String,
}

impl ProxyEndpoint {
    /// Reads an `http://` URL with an optional user name and password, host
    /// and port.
    ///
    /// # Errors
    ///
    /// Why it can't be used, in a message without the user name or password.
    pub fn parse(value: &str) -> Result<Self, String> {
        let not_a_url =
            || "The proxy setting is not a URL. Halonic needs it as http://host:port.".to_owned();
        let url = Url::parse(value).map_err(|_| not_a_url())?;
        let host = url.host_str().unwrap_or_default().to_owned();
        // Without `//` after the scheme, `bob:secret@proxy:3128` reads as the
        // scheme `bob:` with no host. Say nothing of the scheme then: it is
        // the user name.
        if host.is_empty() {
            return Err(not_a_url());
        }
        let shown = url
            .port()
            .map_or_else(|| host.clone(), |port| format!("{host}:{port}"));
        if url.scheme() != "http" {
            return Err(format!(
                "Halonic supports an http:// proxy; yours is {}://{shown}. Use http://host:port.",
                url.scheme()
            ));
        }
        if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
            return Err(format!(
                "The proxy setting for {shown} has more than host and port in it."
            ));
        }
        let port = url.port_or_known_default().unwrap_or(80);
        if port == 0 {
            return Err(format!("The proxy setting for {host} uses port 0."));
        }
        let credentials = credentials_of(&url).map_err(|MalformedCredentials| {
            format!("The user name or password in the proxy setting for {shown} is malformed.")
        })?;
        Ok(Self {
            host,
            port,
            credentials,
        })
    }

    /// `http://host:port`, never the user name or password.
    pub fn url(&self) -> String {
        format!("http://{}:{}", self.host, self.port)
    }

    /// The user name and password for the CONNECT line, if the URL had them.
    pub fn credentials(&self) -> Option<(&str, &str)> {
        self.credentials
            .as_ref()
            .map(|credentials| (credentials.username.as_str(), credentials.password.as_str()))
    }
}

impl fmt::Debug for ProxyEndpoint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.url())
    }
}

impl fmt::Display for ProxyEndpoint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.url())
    }
}

/// A `%` in the user name or password without two hex digits after it, or
/// bytes that aren't UTF-8.
struct MalformedCredentials;

/// The URL's user name and password, decoded, if it has them.
fn credentials_of(url: &Url) -> Result<Option<Credentials>, MalformedCredentials> {
    let (username, password) = (url.username(), url.password().unwrap_or_default());
    if username.is_empty() && password.is_empty() {
        return Ok(None);
    }
    let decode = |text: &str| percent_decoded(text).ok_or(MalformedCredentials);
    Ok(Some(Credentials {
        username: decode(username)?,
        password: decode(password)?,
    }))
}

/// Decodes `%XX` as `decodeURIComponent` does: `None` for a `%` without two
/// hex digits after it, or bytes that aren't UTF-8.
fn percent_decoded(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = bytes.get(index + 1..index + 3)?;
            if !hex.iter().all(u8::is_ascii_hexdigit) {
                return None;
            }
            let text = std::str::from_utf8(hex).ok()?;
            decoded.push(u8::from_str_radix(text, 16).ok()?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

#[cfg(test)]
#[path = "proxy_tests.rs"]
mod tests;
