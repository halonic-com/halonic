//! `engine_chat_stream` (HAL-17130): a Try it chat turn whose answer the
//! page reads as the model writes it. `engine_request` answers one JSON
//! body, so through it a turn's text only shows once the turn is done. This
//! command asks the engine for the turn as NDJSON (`server.chat-turn-stream`)
//! and passes each line on to the page's channel.
//!
//! It takes `POST /api/chat-turn` and nothing else: every other route keeps
//! going through `engine_request` or `engine_stream`, and the route table
//! stays as it is. The stream is one of the page's engine streams, so
//! `engine_stream_end` (Stop), a reload and the engine going all end it, and
//! ending it hangs up on the engine, which then stops the model call.

use std::time::Duration;

use halonic_agent_host::{Answer, LineSplitter};
use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, Webview};
use tauri_plugin_http::reqwest;

use super::calls::{ANSWER_LIMIT, Opening, read_answer, request, request_body};
use super::{
    EngineRefusal, EngineState, EngineStreamStart, checked_path, named_route, open_refusal,
    unavailable,
};
use crate::engine_routes::EngineRoute;
use crate::page_streams::StreamKey;

/// The one route this command calls.
const CHAT_TURN: &str = "POST /api/chat-turn";

/// The media type of a streamed chat turn: one JSON object per line.
const LINES_TYPE: &str = "application/x-ndjson";

/// One message on a chat turn's channel: a line of the engine's answer,
/// parsed from JSON, then `end`, or `failed` when the stream broke off.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EngineChatMessage {
    Line { line: Value },
    End,
    Failed { message: String },
}

/// Calls the window's engine for a chat turn with `body`, as the page's
/// stream `stream`, and asks for the answer as lines. Each line goes to
/// `channel` until the engine ends the turn, the page ends it with
/// `engine_stream_end` (Stop), or the page reloads or closes. When the
/// engine refuses the turn, or answers it whole, the command answers the
/// engine's status and body instead. Any route other than
/// `POST /api/chat-turn` is refused as `unknown_route` before anything is
/// sent. A turn has the same 10 minutes as through `engine_request`.
#[tauri::command]
pub async fn engine_chat_stream<R: Runtime>(
    webview: Webview<R>,
    route: String,
    stream: u64,
    body: Option<Value>,
    channel: Channel<EngineChatMessage>,
) -> Result<EngineStreamStart, EngineRefusal> {
    let route = chat_turn_route(&route)?;
    let path = checked_path(route, None)?;
    let body = request_body(route, body)?;
    let key = StreamKey {
        page: webview.label().to_owned(),
        stream,
    };
    let state = webview.state::<EngineState>();
    let serial = state.streams.open(&key).map_err(open_refusal)?;
    let opening = open_lines(&webview, route, &path, body, state.stream_opening_limit).await;
    let response = match opening {
        Ok(Opening::Stream(response)) => response,
        Ok(Opening::Refused(answer)) => {
            state.streams.forget(&key, serial);
            return Ok(EngineStreamStart::Refused { answer });
        }
        Err(refusal) => {
            state.streams.forget(&key, serial);
            return Err(refusal);
        }
    };
    let app = webview.app_handle().clone();
    let task_key = key.clone();
    // The page may have ended the turn, or reloaded, while the engine
    // answered. Then no task starts, and dropping the response hangs up.
    let started = state.streams.start(&key, serial, move || {
        tauri::async_runtime::spawn(forward_lines(app, task_key, serial, response, channel))
    });
    if !started {
        return Err(EngineRefusal::new(
            "stream_ended",
            "the page ended the chat turn before the engine answered",
        ));
    }
    Ok(EngineStreamStart::Opened { stream })
}

/// The chat turn route, when the page names it; any other name is refused,
/// even a route of the table. The refusal doesn't repeat the name.
fn chat_turn_route(name: &str) -> Result<EngineRoute, EngineRefusal> {
    if name != CHAT_TURN {
        return Err(EngineRefusal::new(
            "unknown_route",
            "only a chat turn streams its lines",
        ));
    }
    named_route(name, Answer::Json)
}

/// Sends the turn and waits for the engine to start its lines, or to finish
/// answering otherwise, for at most `limit`. An engine that doesn't is
/// refused as `engine_unavailable`, and the request is dropped, which hangs
/// up on it.
async fn open_lines<R: Runtime>(
    webview: &Webview<R>,
    route: EngineRoute,
    path: &str,
    body: Option<Vec<u8>>,
    limit: Duration,
) -> Result<Opening, EngineRefusal> {
    let opening = async {
        let response = request(webview, route, path, body)?
            .header(reqwest::header::ACCEPT, LINES_TYPE)
            .send()
            .await
            .map_err(|_| unavailable())?;
        if response.status() != reqwest::StatusCode::OK || !sends_lines(&response) {
            return read_answer(response).await.map(Opening::Refused);
        }
        Ok(Opening::Stream(response))
    };
    tokio::time::timeout(limit, opening)
        .await
        .unwrap_or_else(|_| Err(unavailable()))
}

/// Whether the engine answered with lines, rather than the whole turn.
fn sends_lines(response: &reqwest::Response) -> bool {
    response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .is_some_and(|media| media.trim().eq_ignore_ascii_case(LINES_TYPE))
}

/// Passes the turn's lines to the page, then how it ended, and forgets the
/// stream. Dropping the response hangs up on the engine.
async fn forward_lines<R: Runtime>(
    app: AppHandle<R>,
    key: StreamKey,
    serial: u64,
    mut response: reqwest::Response,
    channel: Channel<EngineChatMessage>,
) {
    let ending = read_lines(&mut response, &channel).await;
    drop(response);
    // The page may have gone; then nobody hears how it ended.
    let _ = channel.send(ending);
    app.state::<EngineState>().streams.forget(&key, serial);
}

/// Sends each whole line until the turn ends, and answers how it ended.
/// The engine ends every line with a newline, so a line the stream stops in
/// the middle of is never passed on: the page then sees the turn end
/// without its answer and counts it as failed.
async fn read_lines(
    response: &mut reqwest::Response,
    channel: &Channel<EngineChatMessage>,
) -> EngineChatMessage {
    let mut splitter = LineSplitter::new(ANSWER_LIMIT);
    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => return EngineChatMessage::End,
            Err(error) if error.is_timeout() => {
                return failed("the chat turn took longer than 10 minutes");
            }
            Err(_) => return failed("the engine's chat turn broke off"),
        };
        let Ok(lines) = splitter.push(&chunk) else {
            return failed("the engine sent a line longer than the shell reads (16 MiB)");
        };
        for line in lines {
            if let Some(ending) = send_line(channel, &line) {
                return ending;
            }
        }
    }
}

/// Sends one line; answers how the turn ends when it can't go on.
fn send_line(channel: &Channel<EngineChatMessage>, line: &[u8]) -> Option<EngineChatMessage> {
    let Ok(line) = serde_json::from_slice::<Value>(line) else {
        return Some(failed("the engine sent a line that isn't JSON"));
    };
    match channel.send(EngineChatMessage::Line { line }) {
        Ok(()) => None,
        Err(_) => Some(failed("the page stopped listening")),
    }
}

fn failed(message: &str) -> EngineChatMessage {
    EngineChatMessage::Failed {
        message: message.to_owned(),
    }
}
