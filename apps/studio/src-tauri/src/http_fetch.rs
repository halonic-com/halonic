//! The `http_fetch` and `http_fetch_abort` commands (HAL-10348): the page's
//! way to make an outbound HTTP call, so a model provider's missing CORS
//! headers don't matter and the key stays out of the webview's network layer.
//!
//! The policy lives in `halonic-http-guard`. This file runs it: it checks the
//! request, resolves the host name and checks every address it gives, then
//! connects to exactly those addresses (so the name can't resolve elsewhere
//! between check and connect), follows redirects by hand and checks each hop
//! again, and stops at the body and time limits. A refusal is a value with a
//! stable `kind`; none holds a header value or the address's query.

use std::collections::HashMap;
use std::net::{SocketAddr, ToSocketAddrs};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use halonic_http_guard::{
    CheckedRequest, MAX_REDIRECTS, MAX_RESPONSE_BYTES, PageRequest, Refusal, check_address,
    check_redirect, check_request,
};
use serde::Serialize;
use tauri::{Manager, Runtime, Webview};
use tauri_plugin_http::reqwest;
use url::{Host, Url};

/// How long one call may take in all, redirects and the whole body included.
const CALL_TIMEOUT: Duration = Duration::from_secs(300);

/// How long connecting to one address may take.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

/// Stops a call's task.
type Abort = Box<dyn Fn() + Send>;

/// The calls the pages have in flight, so a page can abort one.
#[derive(Default)]
pub struct HttpFetchState {
    calls: Mutex<HashMap<CallKey, Abort>>,
}

/// A call, by the page that made it and the id that page gave it.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct CallKey {
    page: String,
    call: u64,
}

impl HttpFetchState {
    fn add(&self, key: CallKey, abort: Abort) -> Result<(), FetchRefusal> {
        let mut calls = self.calls.lock().unwrap_or_else(|e| e.into_inner());
        if calls.contains_key(&key) {
            return Err(FetchRefusal::new(
                "call_in_use",
                format!("the page already has a call {}", key.call),
            ));
        }
        calls.insert(key, abort);
        Ok(())
    }

    fn forget(&self, key: &CallKey) {
        self.calls
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(key);
    }

    /// Aborts the calls `ends` picks.
    fn abort(&self, ends: impl Fn(&CallKey) -> bool) {
        let mut calls = self.calls.lock().unwrap_or_else(|e| e.into_inner());
        calls.retain(|key, abort| {
            if ends(key) {
                abort();
                false
            } else {
                true
            }
        });
    }
}

/// Why a call failed: a stable `kind` and a message for the log. The guard's
/// codes (`method_refused`, `url_refused`, `address_refused`, …) are kinds;
/// the shell adds `call_in_use`, `aborted`, `timeout`, `network`,
/// `response_too_large`, `too_many_redirects` and `resolve_failed`.
#[derive(Debug, Serialize)]
pub struct FetchRefusal {
    kind: String,
    message: String,
}

impl FetchRefusal {
    fn new(kind: &str, message: impl std::fmt::Display) -> Self {
        Self {
            kind: kind.to_owned(),
            message: message.to_string(),
        }
    }
}

impl From<Refusal> for FetchRefusal {
    fn from(refusal: Refusal) -> Self {
        Self::new(refusal.code(), refusal.message())
    }
}

/// What the server said. `body` is the answer's bytes read as UTF-8, with
/// U+FFFD for bytes that aren't; the page's `fetch` for model APIs and
/// JSON needs nothing more.
#[derive(Debug, Serialize)]
pub struct FetchAnswer {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
    /// The address the answer came from, after any redirects.
    url: String,
}

/// Makes the call `call`. It ends with the server's answer (any status is an
/// answer), a refusal, or the page's `http_fetch_abort`; a page that reloads
/// or closes ends its calls too (`end_page_calls`).
#[tauri::command]
pub async fn http_fetch<R: Runtime>(
    webview: Webview<R>,
    request: PageRequest,
    call: u64,
) -> Result<FetchAnswer, FetchRefusal> {
    let checked = check_request(request)?;
    let key = CallKey {
        page: webview.label().to_owned(),
        call,
    };
    let app = webview.app_handle().clone();
    let task = tauri::async_runtime::spawn(run(checked));
    let handle = task.inner().abort_handle();
    app.state::<HttpFetchState>()
        .add(key.clone(), Box::new(move || handle.abort()))
        .inspect_err(|_| task.inner().abort())?;
    let answer = task.await;
    app.state::<HttpFetchState>().forget(&key);
    answer.unwrap_or_else(|_| Err(FetchRefusal::new("aborted", "the call was aborted")))
}

/// Aborts a call the page no longer needs. An id that has finished is fine.
#[tauri::command]
pub fn http_fetch_abort<R: Runtime>(webview: Webview<R>, call: u64) {
    let page = webview.label();
    webview
        .state::<HttpFetchState>()
        .abort(|key| key.page == page && key.call == call);
}

/// Aborts every call of a page that reloaded or closed.
pub fn end_page_calls<R: Runtime>(app: &tauri::AppHandle<R>, page: &str) {
    app.state::<HttpFetchState>().abort(|key| key.page == page);
}

async fn run(first: CheckedRequest) -> Result<FetchAnswer, FetchRefusal> {
    let deadline = Instant::now() + CALL_TIMEOUT;
    let mut request = first;
    let mut hops = 0;
    loop {
        let response = send(&request, deadline).await?;
        let status = response.status();
        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        match location {
            Some(location) if status.is_redirection() && request.follow_redirects => {
                hops += 1;
                if hops > MAX_REDIRECTS {
                    return Err(FetchRefusal::new(
                        "too_many_redirects",
                        "the answer was redirected too many times",
                    ));
                }
                request = next_hop(&request, &location, status.as_u16())?;
            }
            _ => return answer(response, deadline).await,
        }
    }
}

/// The headers that go on to another origin. Every other header may hold a
/// key (`api-key`, `x-goog-api-key`, or one an endpoint names itself), so it
/// stays behind.
const CROSS_ORIGIN_HEADERS: [&str; 5] = [
    "accept",
    "accept-language",
    "content-language",
    "content-type",
    "user-agent",
];

/// The request a redirect leads to. As the Web's `fetch` does: a 303, or a
/// 301 or 302 after a POST, becomes a GET without a body; and a hop to
/// another origin keeps only a short list of safe headers.
fn next_hop(
    from: &CheckedRequest,
    location: &str,
    status: u16,
) -> Result<CheckedRequest, FetchRefusal> {
    let url = check_redirect(from, location)?;
    let mut next = CheckedRequest {
        url,
        ..from.clone()
    };
    if status == 303 || (matches!(status, 301 | 302) && from.method == "POST") {
        next.method = "GET".to_owned();
        next.body = None;
        next.headers.retain(|(name, _)| {
            !name.eq_ignore_ascii_case("content-type")
                && !name.eq_ignore_ascii_case("content-encoding")
        });
    }
    if next.url.origin() != from.url.origin() {
        next.headers
            .retain(|(name, _)| CROSS_ORIGIN_HEADERS.contains(&name.to_ascii_lowercase().as_str()));
    }
    Ok(next)
}

/// Sends one hop, to the addresses the guard has accepted.
async fn send(
    request: &CheckedRequest,
    deadline: Instant,
) -> Result<reqwest::Response, FetchRefusal> {
    let mut builder = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(CONNECT_TIMEOUT);
    if let Some(Host::Domain(name)) = request.url.host() {
        let addresses = resolve(&request.url, request.is_plain()).await?;
        builder = builder.resolve_to_addrs(name, &addresses);
    }
    let client = builder
        .build()
        .map_err(|_| FetchRefusal::new("network", "the HTTP client couldn't be made"))?;
    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|_| FetchRefusal::new("method_refused", "that method is not allowed"))?;
    let mut call = client
        .request(method, request.url.clone())
        .timeout(remaining(deadline)?);
    for (name, value) in &request.headers {
        call = call.header(name, value);
    }
    if let Some(body) = &request.body {
        call = call.body(body.clone());
    }
    call.send().await.map_err(failed)
}

/// Resolves the host and checks every address it gives; a name with one
/// refused address is refused, so a mixed answer can't be used to pick.
async fn resolve(url: &Url, plain: bool) -> Result<Vec<SocketAddr>, FetchRefusal> {
    let host = url.host_str().unwrap_or_default().to_owned();
    let port = url.port_or_known_default().unwrap_or(443);
    let addresses = tauri::async_runtime::spawn_blocking(move || {
        (host.as_str(), port)
            .to_socket_addrs()
            .map(Iterator::collect::<Vec<_>>)
    })
    .await
    .map_err(|_| FetchRefusal::new("resolve_failed", "the host name couldn't be resolved"))?
    .map_err(|_| FetchRefusal::new("resolve_failed", "the host name couldn't be resolved"))?;
    if addresses.is_empty() {
        return Err(FetchRefusal::new(
            "resolve_failed",
            "the host name has no address",
        ));
    }
    for address in &addresses {
        check_address(address.ip(), plain)?;
    }
    Ok(addresses)
}

/// Reads the answer, up to [`MAX_RESPONSE_BYTES`] and the call's deadline.
async fn answer(
    mut response: reqwest::Response,
    deadline: Instant,
) -> Result<FetchAnswer, FetchRefusal> {
    let status = response.status().as_u16();
    let url = response.url().to_string();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| Some((name.to_string(), value.to_str().ok()?.to_owned())))
        .collect();
    let mut bytes = Vec::new();
    loop {
        remaining(deadline)?;
        let Some(chunk) = response.chunk().await.map_err(failed)? else {
            break;
        };
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(FetchRefusal::new(
                "response_too_large",
                "the answer is larger than Studio takes (32 MiB)",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(FetchAnswer {
        status,
        headers,
        body: String::from_utf8_lossy(&bytes).into_owned(),
        url,
    })
}

fn remaining(deadline: Instant) -> Result<Duration, FetchRefusal> {
    deadline
        .checked_duration_since(Instant::now())
        .filter(|left| !left.is_zero())
        .ok_or_else(|| FetchRefusal::new("timeout", "the call took too long"))
}

/// A failed send or read. The message never holds the address: reqwest puts
/// it in its errors, and its query may hold a key.
fn failed(error: reqwest::Error) -> FetchRefusal {
    if error.is_timeout() {
        FetchRefusal::new("timeout", "the call took too long")
    } else if error.is_connect() {
        FetchRefusal::new("network", "couldn't connect to the host")
    } else {
        FetchRefusal::new("network", "the call failed on the network")
    }
}

#[cfg(test)]
#[path = "http_fetch_tests.rs"]
mod tests;
