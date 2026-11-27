//! A sandbox part's download (HAL-20583, design 3): the [`PartFetch`] the
//! shell gives `halonic_agent_host::parts::resolve_part`. It goes through
//! the updater's proxy rules (`updates_proxy.rs`), with a redirect policy
//! that asks every hop of the parts allow-list and of `route_for`, and stops
//! when no data arrives for 60 s. The pin's URL is checked the same way
//! before anything is sent. There is no switch, setting or variable that
//! widens it.

use std::io::{self, Cursor, Read};
use std::sync::Arc;

use halonic_agent_host::parts::{FetchBody, FetchError, PartFetch, UrlView, part_url_allowed};
use halonic_http_guard::{ProxySetting, route_for};
use halonic_update_state::{CHECK_TIME_LIMIT, DOWNLOAD_STALL_LIMIT};
use reqwest::header::{CONTENT_RANGE, RANGE};
use reqwest::{Response, StatusCode, Url};
use tauri::{AppHandle, Manager, Runtime};

use crate::http_fetch::HttpFetchState;
use crate::updates::proxy::part_client;

/// Whether a part's download may go to `url`, its `redirects`-th redirect
/// (0 for the pin's own URL), by the parts allow-list.
///
/// # Errors
///
/// Why the hop is refused.
pub(crate) fn part_hop_allowed(url: &Url, redirects: usize) -> Result<(), String> {
    let view = UrlView {
        scheme: url.scheme(),
        has_credentials: !url.username().is_empty() || url.password().is_some(),
        host: url.host_str().unwrap_or_default(),
        port: url.port_or_known_default(),
        path: url.path(),
    };
    part_url_allowed(&view, redirects)
}

/// Downloads parts on the proxy setting `http_fetch` read at start. Its
/// calls block, so it runs off the async threads (`spawn_blocking`).
pub(crate) struct PartDownloader {
    setting: Arc<ProxySetting>,
}

impl PartDownloader {
    /// A downloader on the app's proxy setting.
    pub(crate) fn for_app<R: Runtime>(app: &AppHandle<R>) -> Self {
        Self {
            setting: app.state::<HttpFetchState>().proxy(),
        }
    }
}

impl PartFetch for PartDownloader {
    fn open(&self, url: &str, from: u64) -> Result<FetchBody, FetchError> {
        let url = Url::parse(url).map_err(|error| FetchError::Refused(error.to_string()))?;
        part_hop_allowed(&url, 0).map_err(FetchError::Refused)?;
        route_for(&url, &self.setting)
            .map_err(|refusal| FetchError::Refused(refusal.message().to_owned()))?;
        // The updater installs this crypto provider before it builds a
        // client; this download builds one without the updater.
        if rustls::crypto::CryptoProvider::get_default().is_none() {
            let _ = rustls::crypto::ring::default_provider().install_default();
        }
        let client = part_client(&self.setting)
            .connect_timeout(CHECK_TIME_LIMIT)
            .read_timeout(DOWNLOAD_STALL_LIMIT)
            .build()
            .map_err(network)?;
        let mut request = client.get(url);
        if from > 0 {
            request = request.header(RANGE, format!("bytes={from}-"));
        }
        let response = tauri::async_runtime::block_on(request.send()).map_err(network)?;
        let content_range = response
            .headers()
            .get(CONTENT_RANGE)
            .and_then(|value| value.to_str().ok());
        let start = body_start(response.status(), content_range, from)?;
        Ok(FetchBody {
            start,
            reader: Box::new(ResponseReader {
                response,
                chunk: Cursor::new(Vec::new()),
            }),
        })
    }
}

/// Where the answer's body starts: `from` for a `206` whose `Content-Range`
/// starts there, 0 for a `200`, which sends the whole part.
///
/// # Errors
///
/// [`FetchError::Status`] for any other status, and
/// [`FetchError::Network`] for a `206` from another byte.
fn body_start(
    status: StatusCode,
    content_range: Option<&str>,
    from: u64,
) -> Result<u64, FetchError> {
    match status {
        StatusCode::OK => Ok(0),
        StatusCode::PARTIAL_CONTENT if range_start(content_range) == Some(from) => Ok(from),
        StatusCode::PARTIAL_CONTENT => Err(FetchError::Network(format!(
            "the server sent another range than from byte {from}."
        ))),
        other => Err(FetchError::Status(other.as_u16())),
    }
}

/// The first byte of a `Content-Range: bytes <first>-<last>/<size>`.
fn range_start(content_range: Option<&str>) -> Option<u64> {
    let range = content_range?.strip_prefix("bytes ")?;
    let (first, _) = range.split_once('-')?;
    first.parse().ok()
}

fn network(error: reqwest::Error) -> FetchError {
    FetchError::Network(error.to_string())
}

/// The answer's body as a blocking reader, one chunk at a time.
struct ResponseReader {
    response: Response,
    chunk: Cursor<Vec<u8>>,
}

impl Read for ResponseReader {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        loop {
            let read = self.chunk.read(buffer)?;
            if read > 0 || buffer.is_empty() {
                return Ok(read);
            }
            let next = tauri::async_runtime::block_on(self.response.chunk())
                .map_err(|error| io::Error::other(error.to_string()))?;
            match next {
                Some(bytes) => self.chunk = Cursor::new(bytes.to_vec()),
                None => return Ok(0),
            }
        }
    }
}

#[cfg(test)]
#[path = "parts_download_tests.rs"]
mod tests;
