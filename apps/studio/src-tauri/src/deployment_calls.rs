//! The `deployment_request`, `deployment_stream` and `deployment_stream_end`
//! commands: the page reads the runs of an owner server it signed in to,
//! through the shell (HAL-20105). The page names the origin, a route of
//! `halonic-owner-sign-in`'s list and a run id; the shell calls only an
//! origin it keeps a session for, on the addresses the connect check pins,
//! adds the session itself and follows no redirect. The page never sees the
//! session, a header or the address that was called.

use std::time::Duration;

use halonic_owner_sign_in::{
    Call, CallRefusal, DeploymentRoute, OwnerError, owner_origin, session_for,
};
use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, Webview};
use tauri_plugin_http::reqwest;
use tauri_plugin_http::reqwest::header::{ACCEPT, COOKIE};

use crate::deployment_reads::{IDLE_TIMEOUT, read_answer, read_events};
use crate::engine::EngineStreamMessage;
use crate::owner_sign_in::{PinnedServer, checked, failed};
use crate::page_streams::{OpenRefusal, PageStreams, StreamKey};
use crate::secrets::SecretsState;

/// How long a JSON route may take, its answer included, and how long a
/// stream may take to open.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// How many streams one page may have open at once.
const STREAMS_PER_PAGE: usize = 8;

/// The streams pages have open to owner servers.
pub struct DeploymentState {
    streams: PageStreams,
}

impl Default for DeploymentState {
    fn default() -> Self {
        Self {
            streams: PageStreams::new(STREAMS_PER_PAGE),
        }
    }
}

/// Why the shell made no call or passed no answer on: only a code, such as
/// `notSignedIn`, `unknownRoute`, `badRun`, `redirected`, `notAnswering`,
/// `invalidCertificate`, `unreadable`, `streamInUse`, `tooManyStreams` or
/// `streamEnded`. It never repeats the origin, the session or the address.
#[derive(Debug, Serialize)]
pub struct DeploymentRefusal {
    code: String,
}

impl DeploymentRefusal {
    pub(crate) fn new(code: &str) -> Self {
        Self {
            code: code.to_owned(),
        }
    }
}

impl From<CallRefusal> for DeploymentRefusal {
    fn from(refusal: CallRefusal) -> Self {
        Self {
            code: refusal.code(),
        }
    }
}

impl From<OwnerError> for DeploymentRefusal {
    fn from(code: OwnerError) -> Self {
        CallRefusal::from(code).into()
    }
}

/// The server's answer to a JSON route: its status and body (`null` when
/// the body is empty).
#[derive(Debug, Serialize)]
pub struct DeploymentAnswer {
    pub(crate) status: u16,
    pub(crate) body: Value,
}

/// What `deployment_stream` answers: the page's id for the stream, whose
/// events then come on the channel, or the server's refusal.
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum DeploymentStreamStart {
    Opened { stream: u64 },
    Refused { answer: DeploymentAnswer },
}

/// Calls a JSON route of the owner server at `origin` for `run`, and
/// answers the server's status and body.
#[tauri::command]
pub async fn deployment_request<R: Runtime>(
    webview: Webview<R>,
    origin: String,
    route: String,
    run: Option<String>,
) -> Result<DeploymentAnswer, DeploymentRefusal> {
    let request = prepare(&webview, &origin, &route, run.as_deref(), false).await?;
    tokio::time::timeout(REQUEST_TIMEOUT, answer_of(request))
        .await
        .unwrap_or_else(|_| Err(OwnerError::NotAnswering.into()))
}

/// Opens a stream route of the owner server at `origin` for `run`, as the
/// page's stream `stream`, from after the event `after` when given (sent as
/// `Last-Event-ID`). Its events go to `channel` until the server ends the
/// stream, it sends nothing for 2 minutes, the page ends it with
/// `deployment_stream_end`, or the page reloads or closes.
#[tauri::command]
pub async fn deployment_stream<R: Runtime>(
    webview: Webview<R>,
    origin: String,
    route: String,
    run: Option<String>,
    after: Option<u64>,
    stream: u64,
    channel: Channel<EngineStreamMessage>,
) -> Result<DeploymentStreamStart, DeploymentRefusal> {
    let canonical = owner_origin(&origin)?;
    let prepared = prepare(&webview, &origin, &route, run.as_deref(), true);
    open_stream(&webview, &canonical, stream, after, prepared, channel).await
}

/// Opens the page's stream `stream` to the owner server at `origin` with
/// the request `prepare` makes, as [`deployment_stream`] does.
pub(crate) async fn open_stream<R: Runtime>(
    webview: &Webview<R>,
    origin: &str,
    stream: u64,
    after: Option<u64>,
    prepare: impl Future<Output = Result<reqwest::RequestBuilder, DeploymentRefusal>>,
    channel: Channel<EngineStreamMessage>,
) -> Result<DeploymentStreamStart, DeploymentRefusal> {
    let mut request = prepare.await?.header(ACCEPT, "text/event-stream");
    if let Some(after) = after {
        request = request.header("Last-Event-ID", after.to_string());
    }
    let key = StreamKey {
        page: webview.label().to_owned(),
        stream,
    };
    let state = webview.state::<DeploymentState>();
    let serial = state.streams.open_tagged(&key, origin).map_err(open_refusal)?;
    let opened = tokio::time::timeout(REQUEST_TIMEOUT, opening_of(request))
        .await
        .unwrap_or_else(|_| Err(OwnerError::NotAnswering.into()));
    let response = match opened {
        Ok(Ok(response)) => response,
        Ok(Err(answer)) => {
            state.streams.forget(&key, serial);
            return Ok(DeploymentStreamStart::Refused { answer });
        }
        Err(refusal) => {
            state.streams.forget(&key, serial);
            return Err(refusal);
        }
    };
    let app = webview.app_handle().clone();
    let task_key = key.clone();
    // The page may have ended the stream, or reloaded, while the server
    // answered. Then no task starts, and dropping the response hangs up.
    let started = state.streams.start(&key, serial, move || {
        tauri::async_runtime::spawn(async move {
            forward_events(&app, task_key, serial, response, channel).await;
        })
    });
    if !started {
        return Err(DeploymentRefusal::new("streamEnded"));
    }
    Ok(DeploymentStreamStart::Opened { stream })
}

/// Ends a stream the page no longer reads. An id that has ended is fine.
#[tauri::command]
pub fn deployment_stream_end<R: Runtime>(webview: Webview<R>, stream: u64) {
    let page = webview.label();
    webview
        .state::<DeploymentState>()
        .streams
        .end(|key| key.page == page && key.stream == stream);
}

/// Ends every stream of the page `page`, which is reloading or closed.
pub fn end_page<R: Runtime>(app: &impl Manager<R>, page: &str) {
    if let Some(state) = app.try_state::<DeploymentState>() {
        state.streams.end(|key| key.page == page);
    }
}

/// Ends every stream open to the owner server at `origin`, the canonical
/// origin [`owner_origin`] answers, whose session the shell is forgetting.
pub fn end_origin<R: Runtime>(app: &impl Manager<R>, origin: &str) {
    if let Some(state) = app.try_state::<DeploymentState>() {
        state.streams.end_tagged(origin);
    }
}

/// The request for `route` and `run` to `origin`, with its session: only a
/// route of the list, only a run id, only an origin the shell keeps a
/// session for, and only at the addresses the connect check pins.
async fn prepare<R: Runtime>(
    webview: &Webview<R>,
    origin: &str,
    route: &str,
    run: Option<&str>,
    streams: bool,
) -> Result<reqwest::RequestBuilder, DeploymentRefusal> {
    let route = DeploymentRoute::named(route)
        .filter(|route| route.streams() == streams)
        .ok_or(CallRefusal::UnknownRoute)?;
    let path = route.path(run)?;
    let keychain = webview.state::<SecretsState>().owner_keychain();
    let (origin, cookie) = session_for(keychain.as_ref(), origin)?;
    let address = checked(&origin).await?;
    let server = PinnedServer::new(&address).ok_or(OwnerError::NotAnswering)?;
    Ok(server.get(&path).header(COOKIE, cookie))
}

/// Sends a JSON route's request and reads its answer.
async fn answer_of(
    request: reqwest::RequestBuilder,
) -> Result<DeploymentAnswer, DeploymentRefusal> {
    let response = request.send().await.map_err(|error| unreached(&error))?;
    read_answer(response).await
}

/// Sends a stream route's request: the open stream, or the server's
/// refusal read whole.
async fn opening_of(
    request: reqwest::RequestBuilder,
) -> Result<Result<reqwest::Response, DeploymentAnswer>, DeploymentRefusal> {
    let response = request.send().await.map_err(|error| unreached(&error))?;
    if response.status() == reqwest::StatusCode::OK {
        return Ok(Ok(response));
    }
    Ok(Err(read_answer(response).await?))
}

/// A call that got no HTTP answer. The error itself holds the address, so
/// only its kind goes on.
fn unreached(error: &reqwest::Error) -> DeploymentRefusal {
    match failed::<()>(error) {
        Call::InvalidCertificate => OwnerError::InvalidCertificate.into(),
        _ => OwnerError::NotAnswering.into(),
    }
}

/// Passes the stream's events to the page, then how it ended, and forgets
/// the stream. Dropping the response hangs up on the server.
async fn forward_events<R: Runtime>(
    app: &AppHandle<R>,
    key: StreamKey,
    serial: u64,
    mut response: reqwest::Response,
    channel: Channel<EngineStreamMessage>,
) {
    let ending = read_events(&mut response, &channel, IDLE_TIMEOUT).await;
    drop(response);
    // The page may have gone; then nobody hears how it ended.
    let _ = channel.send(ending);
    app.state::<DeploymentState>().streams.forget(&key, serial);
}

fn open_refusal(refusal: OpenRefusal) -> DeploymentRefusal {
    DeploymentRefusal::new(match refusal {
        OpenRefusal::InUse => "streamInUse",
        OpenRefusal::TooMany => "tooManyStreams",
        OpenRefusal::Poisoned => "unreadable",
    })
}

#[cfg(test)]
#[path = "deployment_calls_tests.rs"]
mod tests;
