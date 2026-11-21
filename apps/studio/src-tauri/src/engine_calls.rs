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

/// The largest JSON answer the shell reads. The engine's answers are run
/// summaries and lists; this only keeps a broken engine from filling the
/// shell's memory.
const ANSWER_LIMIT: usize = 16 * 1024 * 1024;

/// The largest event the shell reads from a stream. A run event carries a
/// step's output, which the engine already keeps far below this.
const FRAME_LIMIT: usize = 1024 * 1024;

/// How long a JSON route may take, its answer included.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

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

/// Sends one request to the window's engine, with the launch token and no
/// `Origin`. A JSON route has [`REQUEST_TIMEOUT`] for its whole answer.
pub(super) async fn send<R: Runtime>(
    webview: &Webview<R>,
    route: EngineRoute,
    path: &str,
    body: Option<Vec<u8>>,
) -> Result<reqwest::Response, EngineRefusal> {
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
        Answer::Json => request.timeout(REQUEST_TIMEOUT),
        Answer::Stream => request.header(reqwest::header::ACCEPT, "text/event-stream"),
    };
    request
        .bearer_auth(connection.token())
        .send()
        .await
        .map_err(|_| unavailable())
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
