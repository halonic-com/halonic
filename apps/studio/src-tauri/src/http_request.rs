//! The `http_request` command, the page's way to a model provider (HAL-10352).
//! The webview's content security policy (`default-src 'self'`) stops the page
//! from fetching a provider itself, so the shell sends the request for it. It
//! reaches provider hosts only, checks every address the name resolves to and
//! connects only to an address it checked, never follows a redirect (a bearer
//! token must not leave for another host) and uses no proxy.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri_plugin_http::reqwest::{self, Url};

/// Hosts a request may reach over HTTPS, and only at a public address.
const PROVIDER_HOSTS: &[&str] = &[
    "api.anthropic.com",
    "api.openai.com",
    "generativelanguage.googleapis.com",
    "openrouter.ai",
];
/// The local model servers (Ollama, LM Studio): plain HTTP, loopback only, and
/// only their own ports, so the page can't reach Halonic's own services.
const LOCAL_HOSTS: &[&str] = &["localhost", "127.0.0.1"];
const LOCAL_PORTS: &[u16] = &[11434, 1234];

const MAX_REQUEST_BYTES: usize = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 32 * 1024 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(600);

/// Headers the page may not set: the shell and the transport own them.
const REFUSED_HEADERS: &[&str] = &[
    "host",
    "cookie",
    "content-length",
    "connection",
    "transfer-encoding",
    "upgrade",
    "proxy-authorization",
];

#[derive(Debug, Deserialize)]
pub struct HttpRequest {
    url: String,
    method: String,
    #[serde(default)]
    headers: Vec<(String, String)>,
    #[serde(default)]
    body: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct HttpAnswer {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
}

/// Why a request was not sent or answered: a stable `kind` for the page and a
/// message for the log. Neither holds a header value.
#[derive(Debug, Serialize)]
pub struct HttpRefusal {
    kind: &'static str,
    message: String,
}

impl HttpRefusal {
    fn new(kind: &'static str, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

/// Where a checked request may connect.
#[derive(Clone, Debug, PartialEq, Eq)]
struct Target {
    url: Url,
    host: String,
    port: u16,
    loopback: bool,
}

/// Checks the address text: provider hosts only, and nothing else.
fn target_of(raw: &str) -> Result<Target, HttpRefusal> {
    let url = Url::parse(raw).map_err(|_| HttpRefusal::new("invalid_url", "not an address"))?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err(HttpRefusal::new("invalid_url", "an address with a login"));
    }
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let port = url.port_or_known_default().unwrap_or(0);
    let loopback = match url.scheme() {
        "https" if PROVIDER_HOSTS.contains(&host.as_str()) && port == 443 => false,
        "http" if LOCAL_HOSTS.contains(&host.as_str()) && LOCAL_PORTS.contains(&port) => true,
        _ => {
            return Err(HttpRefusal::new(
                "host_refused",
                format!("{host} is not a model provider host"),
            ));
        }
    };
    Ok(Target {
        url,
        host,
        port,
        loopback,
    })
}

/// Whether an address is on the internet: none of this computer, a home
/// network, the network segment, a cloud credential service, or a range that
/// is reserved.
fn is_public(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => is_public_v4(address),
        IpAddr::V6(address) => is_public_v6(address),
    }
}

fn is_public_v4(a: Ipv4Addr) -> bool {
    let [o0, o1, o2, _] = a.octets();
    !(a.is_unspecified()
        || a.is_loopback()
        || a.is_private()
        || a.is_link_local()
        || a.is_broadcast()
        || a.is_multicast()
        || a.is_documentation()
        || o0 == 0
        || o0 >= 240
        || (o0 == 100 && (64..128).contains(&o1))
        || (o0 == 192 && o1 == 0 && o2 == 0)
        || (o0 == 198 && (o1 == 18 || o1 == 19)))
}

fn is_public_v6(a: Ipv6Addr) -> bool {
    if let Some(mapped) = a.to_ipv4_mapped() {
        return is_public_v4(mapped);
    }
    let first = a.segments()[0];
    // Global unicast only (2000::/3), minus the documentation range.
    (first & 0xe000) == 0x2000 && !is_doc_v6(a)
}

fn is_doc_v6(a: Ipv6Addr) -> bool {
    let s = a.segments();
    s[0] == 0x2001 && s[1] == 0x0db8
}

/// Resolves the host and keeps only a result every address of which is of the
/// right class.
fn checked_addresses(target: &Target) -> Result<Vec<SocketAddr>, HttpRefusal> {
    let addresses: Vec<SocketAddr> = (target.host.as_str(), target.port)
        .to_socket_addrs()
        .map_err(|_| HttpRefusal::new("unreachable", format!("can't find {}", target.host)))?
        .collect();
    let right = |address: &SocketAddr| {
        if target.loopback {
            address.ip().is_loopback()
        } else {
            is_public(address.ip())
        }
    };
    if addresses.is_empty() || !addresses.iter().all(right) {
        return Err(HttpRefusal::new(
            "address_refused",
            format!("{} leads somewhere the page may not reach", target.host),
        ));
    }
    Ok(addresses)
}

fn prepared(request: &HttpRequest) -> Result<(Target, reqwest::Method), HttpRefusal> {
    let method = match request.method.to_ascii_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        other => {
            return Err(HttpRefusal::new(
                "method_refused",
                format!("{other} is not allowed"),
            ));
        }
    };
    if request
        .body
        .as_ref()
        .is_some_and(|body| body.len() > MAX_REQUEST_BYTES)
    {
        return Err(HttpRefusal::new(
            "too_large",
            "the request body is too large",
        ));
    }
    for (name, _) in &request.headers {
        let lower = name.to_ascii_lowercase();
        if REFUSED_HEADERS.contains(&lower.as_str()) {
            return Err(HttpRefusal::new(
                "header_refused",
                format!("the header {lower} may not be set"),
            ));
        }
    }
    Ok((target_of(&request.url)?, method))
}

/// Sends one request to a model provider and answers its status, headers and
/// body as text. The address is checked and connected to once, redirects are
/// answered as they are, and the body is read up to a limit.
#[tauri::command]
pub async fn http_request(request: HttpRequest) -> Result<HttpAnswer, HttpRefusal> {
    let (target, method) = prepared(&request)?;
    let lookup = target.clone();
    let addresses = tauri::async_runtime::spawn_blocking(move || checked_addresses(&lookup))
        .await
        .map_err(|error| HttpRefusal::new("unreachable", error.to_string()))??;
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .resolve_to_addrs(&target.host, &addresses)
        .build()
        .map_err(|error| HttpRefusal::new("unreachable", error.to_string()))?;
    let mut builder = client.request(method, target.url);
    for (name, value) in &request.headers {
        builder = builder.header(name, value);
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    let mut response = builder
        .send()
        .await
        .map_err(|error| HttpRefusal::new("unreachable", error.without_url().to_string()))?;
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| Some((name.to_string(), value.to_str().ok()?.to_owned())))
        .collect();
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| HttpRefusal::new("unreachable", error.without_url().to_string()))?
    {
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(HttpRefusal::new("too_large", "the answer is too large"));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(HttpAnswer {
        status,
        headers,
        body: String::from_utf8_lossy(&body).into_owned(),
    })
}

#[cfg(test)]
#[path = "http_request_tests.rs"]
mod tests;
