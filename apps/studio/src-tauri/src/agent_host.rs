//! The `agent_host_*` commands (HAL-4878): the page's way to the agent host
//! (`crates/agent-host`), which runs the sandbox, the bridge and the
//! harnesses. The shell starts one host for the profile on first use, and
//! a new one if it has exited. The page names a route of the host's table,
//! never a URL, and the shell makes the call: the host refuses requests
//! from web pages, and its launch token stays in the shell.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use halonic_agent_host::{
    AgentHost, Answer, Handshake, LineSplitter, Method, Route, executable_beside, find_route,
    host_command,
};
use serde::Serialize;
use serde_json::Value;
use tauri::async_runtime::JoinHandle;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_http::reqwest;

use crate::profile::cli_profile;

/// How long the host may take to unpack its files and serve.
const START_WAIT: Duration = Duration::from_secs(60);

/// The longest JSON answer or stream line the shell reads. The host's own
/// limits are far below it; this only keeps a broken host from filling
/// the shell's memory.
const ANSWER_LIMIT: usize = 16 * 1024 * 1024;

/// The host the shell started, and the streams the page has open on it.
#[derive(Default)]
pub struct AgentHostState {
    host: Mutex<Option<AgentHost>>,
    streams: Mutex<HashMap<u64, JoinHandle<()>>>,
    next_stream: AtomicU64,
}

/// Why a call didn't reach the host: `unknown_route`, `host_unavailable`
/// or `io`, and a message for the log. The host's own refusals are answers.
#[derive(Debug, Serialize)]
pub struct HostRefusal {
    kind: &'static str,
    message: String,
}

impl HostRefusal {
    fn new(kind: &'static str, message: impl std::fmt::Display) -> Self {
        Self {
            kind,
            message: message.to_string(),
        }
    }
}

/// The host's answer to a JSON route: its status and body (`null` when the
/// body isn't JSON).
#[derive(Debug, Serialize)]
pub struct HostAnswer {
    status: u16,
    body: Value,
}

/// What `agent_host_stream` answers: the stream's id, whose lines then
/// come on the channel, or the host's answer when it refused the stream.
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum StreamStart {
    Opened { stream: u64 },
    Refused { answer: HostAnswer },
}

/// One message on a stream's channel: a line, parsed from JSON, then
/// `end`, or `failed` when the stream broke off.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamMessage {
    Line { line: Value },
    End,
    Failed { message: String },
}

/// Calls a JSON route of the host with `body` (`{}` when there is none).
#[tauri::command]
pub async fn agent_host_request<R: Runtime>(
    app: AppHandle<R>,
    route: String,
    body: Option<Value>,
) -> Result<HostAnswer, HostRefusal> {
    let route = named_route(&route, Answer::Json)?;
    let response = send(&app, route, body).await?;
    read_answer(response).await
}

/// Calls a stream route of the host. Its lines go to `channel` until the
/// host ends the stream or the page ends it with `agent_host_stream_end`.
#[tauri::command]
pub async fn agent_host_stream<R: Runtime>(
    app: AppHandle<R>,
    route: String,
    body: Value,
    channel: Channel<StreamMessage>,
) -> Result<StreamStart, HostRefusal> {
    let route = named_route(&route, Answer::Stream)?;
    let response = send(&app, route, Some(body)).await?;
    if response.status() != reqwest::StatusCode::OK {
        let answer = read_answer(response).await?;
        return Ok(StreamStart::Refused { answer });
    }
    let state = app.state::<AgentHostState>();
    let id = state.next_stream.fetch_add(1, Ordering::Relaxed);
    // Held while the task starts, so it can't remove its id before it is there.
    let mut streams = state.streams.lock().map_err(|_| poisoned())?;
    let task = tauri::async_runtime::spawn(forward_lines(app.clone(), id, response, channel));
    streams.insert(id, task);
    Ok(StreamStart::Opened { stream: id })
}

/// Ends a stream the page no longer reads. Hanging up tells the host the
/// caller has gone. An id that has already ended is fine.
#[tauri::command]
pub fn agent_host_stream_end<R: Runtime>(
    app: AppHandle<R>,
    stream: u64,
) -> Result<(), HostRefusal> {
    let state = app.state::<AgentHostState>();
    let task = state
        .streams
        .lock()
        .map_err(|_| poisoned())?
        .remove(&stream);
    if let Some(task) = task {
        task.abort();
    }
    Ok(())
}

fn named_route(name: &str, answer: Answer) -> Result<Route, HostRefusal> {
    find_route(name, answer).ok_or_else(|| {
        HostRefusal::new(
            "unknown_route",
            format!("{name:?} isn't a route of the agent host"),
        )
    })
}

fn poisoned() -> HostRefusal {
    HostRefusal::new(
        "io",
        "the agent host's state was left broken by an earlier failure",
    )
}

/// The running host's handshake, starting the host first when there is
/// none or it has exited. It starts on a worker thread: it unpacks files
/// and waits for the host's first line.
async fn running_host<R: Runtime>(app: &AppHandle<R>) -> Result<Handshake, HostRefusal> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AgentHostState>();
        let mut host = state.host.lock().map_err(|_| poisoned())?;
        if let Some(running) = host.as_mut()
            && !running.has_exited()
        {
            return Ok(running.handshake().clone());
        }
        let profile = cli_profile(&app).map_err(|error| HostRefusal::new("io", error))?;
        let shell = std::env::current_exe().map_err(|error| HostRefusal::new("io", error))?;
        let executable = executable_beside(&shell).map_err(unavailable)?;
        let command = host_command(&executable, Path::new(&profile.root));
        let started = AgentHost::start(command, START_WAIT).map_err(unavailable)?;
        let handshake = started.handshake().clone();
        *host = Some(started);
        Ok(handshake)
    })
    .await
    .map_err(|error| HostRefusal::new("io", error))?
}

fn unavailable(error: impl std::fmt::Display) -> HostRefusal {
    HostRefusal::new("host_unavailable", error)
}

/// Sends one request to the host: loopback only, no proxy, no redirects,
/// with the launch token and no `Origin`.
async fn send<R: Runtime>(
    app: &AppHandle<R>,
    route: Route,
    body: Option<Value>,
) -> Result<reqwest::Response, HostRefusal> {
    let handshake = running_host(app).await?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(unavailable)?;
    let url = format!("{}{}", handshake.url(), route.path);
    let request = match route.method {
        Method::Get => client.get(url),
        Method::Post => {
            let body = body.unwrap_or_else(|| Value::Object(serde_json::Map::new()));
            let bytes = serde_json::to_vec(&body).map_err(|error| HostRefusal::new("io", error))?;
            client
                .post(url)
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body(bytes)
        }
    };
    request
        .bearer_auth(handshake.token())
        .send()
        .await
        .map_err(|_| unavailable("the agent host didn't answer"))
}

/// Reads a whole JSON answer, up to [`ANSWER_LIMIT`]. An answer that is
/// larger or breaks off is an `io` refusal, so a cut-off answer can't pass
/// for the host's whole answer.
async fn read_answer(mut response: reqwest::Response) -> Result<HostAnswer, HostRefusal> {
    let status = response.status().as_u16();
    let mut bytes = Vec::new();
    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(_) => return Err(HostRefusal::new("io", "the agent host's answer broke off")),
        };
        if bytes.len() + chunk.len() > ANSWER_LIMIT {
            return Err(HostRefusal::new(
                "io",
                "the agent host's answer is larger than Studio takes (16 MiB)",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    Ok(HostAnswer { status, body })
}

/// Passes the stream's lines to the page, then how it ended, and forgets
/// the stream. Dropping the response hangs up on the host.
async fn forward_lines<R: Runtime>(
    app: AppHandle<R>,
    id: u64,
    mut response: reqwest::Response,
    channel: Channel<StreamMessage>,
) {
    let ending = read_lines(&mut response, &channel).await;
    drop(response);
    // The page may have gone; then nobody hears how it ended.
    let _ = channel.send(ending);
    if let Ok(mut streams) = app.state::<AgentHostState>().streams.lock() {
        streams.remove(&id);
    }
}

/// Sends each line until the stream ends, and answers how it ended.
async fn read_lines(
    response: &mut reqwest::Response,
    channel: &Channel<StreamMessage>,
) -> StreamMessage {
    let mut splitter = LineSplitter::new(ANSWER_LIMIT);
    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(_) => return failed("the agent host's stream broke off"),
        };
        let Ok(lines) = splitter.push(&chunk) else {
            return failed("the agent host sent a line longer than the shell reads");
        };
        for line in lines {
            if let Some(ending) = send_line(channel, &line) {
                return ending;
            }
        }
    }
    match splitter.finish() {
        Some(line) => send_line(channel, &line).unwrap_or(StreamMessage::End),
        None => StreamMessage::End,
    }
}

/// Sends one line; answers how the stream ends when it can't go on.
fn send_line(channel: &Channel<StreamMessage>, line: &[u8]) -> Option<StreamMessage> {
    let Ok(line) = serde_json::from_slice::<Value>(line) else {
        return Some(failed("the agent host sent a line that isn't JSON"));
    };
    match channel.send(StreamMessage::Line { line }) {
        Ok(()) => None,
        Err(_) => Some(failed("the page stopped listening")),
    }
}

fn failed(message: &str) -> StreamMessage {
    StreamMessage::Failed {
        message: message.to_owned(),
    }
}
