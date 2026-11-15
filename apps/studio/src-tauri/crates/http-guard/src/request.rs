//! What the page may ask the shell to send.

use std::fmt;

use serde::{Deserialize, Serialize};
use url::{Host, Url};

use crate::address::check_address;

/// The longest request body the shell sends.
pub const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
/// The longest answer body the shell reads.
pub const MAX_RESPONSE_BYTES: usize = 32 * 1024 * 1024;
/// The most redirects the shell follows, when the page asks it to follow them.
pub const MAX_REDIRECTS: usize = 5;

const METHODS: &[&str] = &["GET", "POST", "PUT", "PATCH", "DELETE"];

/// Headers the page may not set: they say how the connection itself works,
/// so the shell sets them, or they could make the shell talk to another
/// server than the one it checked.
const FORBIDDEN_HEADERS: &[&str] = &[
    "host",
    "content-length",
    "connection",
    "transfer-encoding",
    "upgrade",
    "te",
    "trailer",
    "keep-alive",
    "expect",
];

/// A request as the page sends it to the shell.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PageRequest {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub body: Option<String>,
    /// Whether the shell follows redirects. The page's `redirect: "error"`
    /// (a bearer token must not follow a redirect) is `false`.
    #[serde(default)]
    pub follow_redirects: bool,
}

/// A request the guard accepted: the method upper-cased, the address read.
#[derive(Debug, Clone)]
pub struct CheckedRequest {
    pub method: String,
    pub url: Url,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
    pub follow_redirects: bool,
}

impl CheckedRequest {
    /// Whether the request goes over plain `http`, for [`check_address`].
    pub fn is_plain(&self) -> bool {
        self.url.scheme() == "http"
    }
}

/// Why a request was refused. `code` is stable; the page matches on it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Refusal {
    code: &'static str,
    message: String,
}

impl Refusal {
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn code(&self) -> &'static str {
        self.code
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl fmt::Display for Refusal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for Refusal {}

/// Checks a request before any network call.
///
/// The method must be one of GET, POST, PUT, PATCH and DELETE; the address
/// `http` or `https`, with a host and no user name or password; a header
/// valid and not one the shell sets itself; the body within [`MAX_BODY_BYTES`].
/// A host that is an IP address is checked at once; a name is checked by the
/// shell with [`check_address`] once it resolves.
///
/// # Errors
///
/// A [`Refusal`]; no message holds a header value or the address's query.
pub fn check_request(request: PageRequest) -> Result<CheckedRequest, Refusal> {
    let method = request.method.to_ascii_uppercase();
    if !METHODS.contains(&method.as_str()) {
        return Err(Refusal::new("method_refused", "that method is not allowed"));
    }
    let url = check_url(&request.url)?;
    for (name, value) in &request.headers {
        check_header(name, value)?;
    }
    if request
        .body
        .as_ref()
        .is_some_and(|body| body.len() > MAX_BODY_BYTES)
    {
        return Err(Refusal::new("request_too_large", "the body is too large"));
    }
    if request.body.is_some() && method == "GET" {
        return Err(Refusal::new("body_refused", "a GET has no body"));
    }
    let checked = CheckedRequest {
        method,
        url,
        headers: request.headers,
        body: request.body,
        follow_redirects: request.follow_redirects,
    };
    check_literal_host(&checked)?;
    Ok(checked)
}

/// Checks where a redirect leads, as a request of its own. The answer's
/// `Location` is read against the address it came from.
///
/// # Errors
///
/// A [`Refusal`] with code `redirect_refused` when the location isn't an
/// address, or the code [`check_request`] gives for it.
pub fn check_redirect(from: &CheckedRequest, location: &str) -> Result<Url, Refusal> {
    let next = from
        .url
        .join(location)
        .map_err(|_| Refusal::new("redirect_refused", "the redirect has no usable address"))?;
    let url = check_url(next.as_str())?;
    let hop = CheckedRequest {
        url: url.clone(),
        ..from.clone()
    };
    check_literal_host(&hop)?;
    Ok(url)
}

fn check_url(raw: &str) -> Result<Url, Refusal> {
    let url = Url::parse(raw).map_err(|_| Refusal::new("url_refused", "not an address"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(Refusal::new(
            "url_refused",
            "only http and https are allowed",
        ));
    }
    if url.host().is_none() {
        return Err(Refusal::new("url_refused", "the address has no host"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(Refusal::new(
            "url_refused",
            "the address may not hold a user name or password",
        ));
    }
    Ok(url)
}

fn check_literal_host(request: &CheckedRequest) -> Result<(), Refusal> {
    match request.url.host() {
        Some(Host::Ipv4(ip)) => check_address(ip.into(), request.is_plain()),
        Some(Host::Ipv6(ip)) => check_address(ip.into(), request.is_plain()),
        _ => Ok(()),
    }
}

fn check_header(name: &str, value: &str) -> Result<(), Refusal> {
    let valid_name = !name.is_empty()
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b));
    let valid_value = value
        .bytes()
        .all(|b| b == b'\t' || (b >= 0x20 && b != 0x7f));
    if !valid_name || !valid_value {
        return Err(Refusal::new("header_refused", "a header is not valid"));
    }
    let lower = name.to_ascii_lowercase();
    if FORBIDDEN_HEADERS.contains(&lower.as_str()) || lower.starts_with("proxy-") {
        return Err(Refusal::new(
            "header_refused",
            format!("the header {lower} is set by the app"),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(method: &str, url: &str) -> PageRequest {
        PageRequest {
            method: method.into(),
            url: url.into(),
            headers: vec![],
            body: None,
            follow_redirects: false,
        }
    }

    fn code(request: PageRequest) -> Option<&'static str> {
        check_request(request).err().map(|refusal| refusal.code())
    }

    #[test]
    fn request_a_provider_call_is_accepted() {
        let mut call = request("post", "https://api.example.com/v1/chat?x=1");
        call.headers = vec![("Authorization".into(), "Bearer made-up".into())];
        call.body = Some("{}".into());
        let checked = check_request(call).unwrap();
        assert_eq!(checked.method, "POST");
        assert!(!checked.is_plain());
    }

    #[test]
    fn request_local_http_is_accepted_and_public_http_is_not() {
        assert_eq!(
            code(request("GET", "http://localhost:11434/api/tags")),
            None
        );
        assert_eq!(code(request("GET", "http://127.0.0.1:11434/")), None);
        assert_eq!(
            code(request("GET", "http://93.184.216.34/")),
            Some("plain_http_public")
        );
    }

    #[test]
    fn request_other_schemes_and_credentials_are_refused() {
        for url in [
            "file:///etc/passwd",
            "ftp://example.com/",
            "data:text/plain,hi",
            "not a url",
        ] {
            assert_eq!(code(request("GET", url)), Some("url_refused"), "{url}");
        }
        assert_eq!(
            code(request("GET", "https://user:pw@example.com/")),
            Some("url_refused")
        );
        assert_eq!(
            code(request("GET", "https://user@example.com/")),
            Some("url_refused")
        );
    }

    #[test]
    fn request_metadata_address_is_refused_even_over_https() {
        assert_eq!(
            code(request("GET", "https://169.254.169.254/latest/")),
            Some("address_refused")
        );
        assert_eq!(
            code(request("GET", "https://[fe80::1]/")),
            Some("address_refused")
        );
        // The same address written in the ways a parser reads as one.
        assert_eq!(
            code(request("GET", "https://2852039166/")),
            Some("address_refused")
        );
        assert_eq!(
            code(request("GET", "https://0xa9fea9fe/")),
            Some("address_refused")
        );
    }

    #[test]
    fn request_methods_are_a_fixed_list() {
        assert_eq!(
            code(request("TRACE", "https://example.com/")),
            Some("method_refused")
        );
        assert_eq!(
            code(request("CONNECT", "https://example.com/")),
            Some("method_refused")
        );
        assert_eq!(code(request("DELETE", "https://example.com/")), None);
    }

    #[test]
    fn request_headers_that_set_the_connection_are_refused() {
        for name in [
            "Host",
            "content-length",
            "Transfer-Encoding",
            "Proxy-Authorization",
            "Connection",
        ] {
            let mut call = request("GET", "https://example.com/");
            call.headers = vec![(name.into(), "x".into())];
            assert_eq!(code(call), Some("header_refused"), "{name}");
        }
        let mut call = request("GET", "https://example.com/");
        call.headers = vec![("X-Ok".into(), "line\r\nInjected: 1".into())];
        assert_eq!(code(call), Some("header_refused"));
    }

    #[test]
    fn request_body_has_a_limit_and_a_get_has_none() {
        let mut big = request("POST", "https://example.com/");
        big.body = Some("x".repeat(MAX_BODY_BYTES + 1));
        assert_eq!(code(big), Some("request_too_large"));
        let mut get = request("GET", "https://example.com/");
        get.body = Some("{}".into());
        assert_eq!(code(get), Some("body_refused"));
    }

    #[test]
    fn request_refusals_never_hold_a_header_value_or_query() {
        let mut call = request("GET", "https://example.com/?key=secret-query");
        call.headers = vec![("Host".into(), "secret-value".into())];
        let message = check_request(call).unwrap_err().to_string();
        assert!(!message.contains("secret"), "{message}");
    }

    #[test]
    fn redirect_is_checked_as_a_request_of_its_own() {
        let from = check_request(request("GET", "https://example.com/a")).unwrap();
        let next = check_redirect(&from, "/b").unwrap();
        assert_eq!(next.as_str(), "https://example.com/b");
        for location in [
            "http://169.254.169.254/",
            "http://93.184.216.34/",
            "file:///etc/passwd",
            "https://user:pw@example.com/",
        ] {
            assert!(check_redirect(&from, location).is_err(), "{location}");
        }
    }

    #[test]
    fn request_unknown_fields_from_the_page_are_refused_when_read() {
        let read = serde_json::from_str::<PageRequest>(
            r#"{"method":"GET","url":"https://example.com/","proxy":"x"}"#,
        );
        assert!(read.is_err());
    }
}
