//! The engine's HTTP calls: the request the shell sends, and reading the
//! engine's answer or its stream of events.

use std::time::Duration;

use halonic_agent_host::{Answer, Method};
use serde_json::{Map, Value};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, Webview};
use tauri_plugin_http::reqwest;

use super::{EngineAnswer, EngineRefusal, EngineState, EngineStreamMessage, unavailable};
use crate::engine_routes::EngineRoute;
use crate::engine_sse::{SseFault, SseReader};
use crate::page_streams::StreamKey;

/// The largest body the page may send. Starting a run with a large input
/// is the biggest; this keeps a page from handing the engine megabytes.
const BODY_LIMIT: usize = 1024 * 1024;

/// The largest JSON answer the shell reads, and the longest line of a
/// streamed chat turn, whose last line is the whole answer. The engine's
/// answers are run summaries and lists; this only keeps a broken engine
/// from filling the shell's memory.
pub(super) const ANSWER_LIMIT: usize = 16 * 1024 * 1024;

/// The largest event the shell reads from a stream. A run event carries a
/// step's output, which the engine already keeps far below this.
const FRAME_LIMIT: usize = 1024 * 1024;

/// How long a JSON route may take, its answer included.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

/// How long a stream route's opening answer may take: its head, and its
/// whole body when the engine refuses the stream. Every wait ends
/// (failure-path rule 1); the events after it have no limit.
pub(super) const OPENING_TIMEOUT: Duration = REQUEST_TIMEOUT;

/// How long a chat turn may take. A turn is one model call, and the model
/// adapters give a model API 5 minutes to start its reply, so 120 s would
/// cut off a slow answer the engine still waits for. The page ends a turn
/// it no longer wants itself (Stop); this only ends a turn on an engine
/// that has stopped answering.
const CHAT_TURN_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// How long the JSON route `route` may take, its answer included.
pub(super) fn time_limit(route: EngineRoute) -> Duration {
    if route.name == "POST /api/chat-turn" {
        CHAT_TURN_TIMEOUT
    } else {
        REQUEST_TIMEOUT
    }
}

/// The bytes a route sends: none for a GET, and the body as JSON for a
/// POST, `{}` when there is none or it is `null`, up to [`BODY_LIMIT`].
pub(super) fn request_body(
    route: EngineRoute,
    body: Option<Value>,
) -> Result<Option<Vec<u8>>, EngineRefusal> {
    let body = body.filter(|body| !body.is_null());
    match route.method {
        Method::Get if body.is_some() => Err(EngineRefusal::new(
            "bad_body",
            "a GET route of the engine takes no body",
        )),
        Method::Get => Ok(None),
        Method::Post => {
            let body = body.unwrap_or_else(|| Value::Object(Map::new()));
            let bytes =
                serde_json::to_vec(&body).map_err(|error| EngineRefusal::new("io", error))?;
            if bytes.len() > BODY_LIMIT {
                return Err(EngineRefusal::new(
                    "bad_body",
                    "the body is larger than the engine takes (1 MiB)",
                ));
            }
            Ok(Some(bytes))
        }
    }
}

/// Sends one request to the window's engine, as [`request`] builds it.
pub(super) async fn send<R: Runtime>(
    webview: &Webview<R>,
    route: EngineRoute,
    path: &str,
    body: Option<Vec<u8>>,
) -> Result<reqwest::Response, EngineRefusal> {
    request(webview, route, path, body)?
        .send()
        .await
        .map_err(|_| unavailable())
}

/// One request to the window's engine, with the launch token and no
/// `Origin`. A JSON route has its [`time_limit`] for its whole answer.
pub(super) fn request<R: Runtime>(
    webview: &Webview<R>,
    route: EngineRoute,
    path: &str,
    body: Option<Vec<u8>>,
) -> Result<reqwest::RequestBuilder, EngineRefusal> {
    let state = webview.state::<EngineState>();
    let connection = state.connection(webview.label())?;
    let client = state.client()?;
    let url = format!("{}{path}", connection.url());
    let mut request = match body {
        None => client.get(url),
        Some(bytes) => client
            .post(url)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(bytes),
    };
    request = match route.answer {
        Answer::Json => request.timeout(time_limit(route)),
        Answer::Stream => request.header(reqwest::header::ACCEPT, "text/event-stream"),
    };
    Ok(request.bearer_auth(connection.token()))
}

/// A stream route's opening answer: the open stream, or the engine's
/// refusal read whole.
pub(super) enum Opening {
    Stream(reqwest::Response),
    Refused(EngineAnswer),
}

/// Calls the stream route `route` and waits for the engine to open the
/// stream, or to finish refusing it, for at most `limit`. An engine that
/// doesn't is refused as `engine_unavailable`, and the request is dropped,
/// which hangs up on it.
pub(super) async fn open_stream<R: Runtime>(
    webview: &Webview<R>,
    route: EngineRoute,
    path: &str,
    limit: Duration,
) -> Result<Opening, EngineRefusal> {
    let opening = async {
        let response = send(webview, route, path, None).await?;
        if response.status() != reqwest::StatusCode::OK {
            return read_answer(response).await.map(Opening::Refused);
        }
        Ok(Opening::Stream(response))
    };
    tokio::time::timeout(limit, opening)
        .await
        .unwrap_or_else(|_| Err(unavailable()))
}

/// Reads a whole JSON answer, up to [`ANSWER_LIMIT`]. An answer that is
/// larger, breaks off or isn't JSON is an `io` refusal.
pub(super) async fn read_answer(
    mut response: reqwest::Response,
) -> Result<EngineAnswer, EngineRefusal> {
    let status = response.status().as_u16();
    let mut bytes = Vec::new();
    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(_) => return Err(EngineRefusal::new("io", "the engine's answer broke off")),
        };
        if bytes.len() + chunk.len() > ANSWER_LIMIT {
            return Err(EngineRefusal::new(
                "io",
                "the engine's answer is larger than Studio takes (16 MiB)",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Ok(EngineAnswer {
            status,
            body: Value::Null,
        });
    }
    let body = serde_json::from_slice(&bytes)
        .map_err(|_| EngineRefusal::new("io", "the engine's answer isn't JSON"))?;
    Ok(EngineAnswer { status, body })
}

/// Passes the stream's events to the page, then how it ended, and forgets
/// the stream. Dropping the response hangs up on the engine.
pub(super) async fn forward_events<R: Runtime>(
    app: &AppHandle<R>,
    key: StreamKey,
    serial: u64,
    mut response: reqwest::Response,
    channel: Channel<EngineStreamMessage>,
) {
    let ending = read_events(&mut response, &channel).await;
    drop(response);
    // The page may have gone; then nobody hears how it ended.
    let _ = channel.send(ending);
    app.state::<EngineState>().streams.forget(&key, serial);
}

/// Sends each event until the stream ends, and answers how it ended.
async fn read_events(
    response: &mut reqwest::Response,
    channel: &Channel<EngineStreamMessage>,
) -> EngineStreamMessage {
    let mut reader = SseReader::new(FRAME_LIMIT);
    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => return EngineStreamMessage::End,
            Err(_) => return failed("the engine's stream broke off"),
        };
        let frames = match reader.push(&chunk) {
            Ok(frames) => frames,
            Err(SseFault::TooLarge) => {
                return failed("the engine sent an event larger than the shell reads (1 MiB)");
            }
            Err(SseFault::NotText) => return failed("the engine sent an event that isn't text"),
        };
        for frame in frames {
            let message = EngineStreamMessage::Event {
                event: frame.event,
                data: frame.data,
                id: frame.id,
            };
            if channel.send(message).is_err() {
                return failed("the page stopped listening");
            }
        }
    }
}

fn failed(message: &str) -> EngineStreamMessage {
    EngineStreamMessage::Failed {
        message: message.to_owned(),
    }
}
