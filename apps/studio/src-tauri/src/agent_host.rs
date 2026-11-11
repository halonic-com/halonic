//! The `agent_host_*` commands (HAL-4878): the page's way to the agent host
//! (`crates/agent-host`), which runs the sandbox, the bridge and the
//! harnesses. The shell starts one host for the profile on first use, and
//! a new one if it has exited. The page names a route of the host's table,
//! never a URL, and the shell makes the call: the host refuses requests
//! from web pages, and its launch token stays in the shell.
//!
//! The page names each stream it opens with an id of its own, so it can
//! end the stream before the host has answered. The shell ends every
//! stream of a page that reloads or closes (`end_page_streams`): such a
//! page can't end them itself, and a quiet stream would stay open in the
//! host for as long as the shell runs.

use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
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
use tauri::{AppHandle, Manager, Runtime, Webview};
use tauri_plugin_http::reqwest;

use crate::profile::cli_profile;

/// How long the host may take to unpack its files and serve.
const START_WAIT: Duration = Duration::from_secs(60);

/// The longest JSON answer or stream line the shell reads. The host's own
/// limits are far below it; this only keeps a broken host from filling
/// the shell's memory.
const ANSWER_LIMIT: usize = 16 * 1024 * 1024;

/// How long a JSON route may take, its answer included. The slowest, such
/// as a sandbox check or closing a bridge, take seconds; this only keeps a
/// hung host from holding the page's call forever.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

/// How long connecting to the host on loopback may take. A stream has no
/// other limit: it may stay quiet for as long as its run or session lasts.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Makes the command that starts the host. Tests pass a stand-in's.
type HostCommand = Box<dyn Fn() -> Command + Send + Sync>;

/// The host the shell started, the streams pages have open on it, and the
/// one HTTP client every call uses.
#[derive(Default)]
pub struct AgentHostState {
    host: Mutex<Option<AgentHost>>,
    streams: Mutex<HashMap<StreamKey, OpenStream>>,
    /// Tells a stream from an earlier one the page gave the same id.
    next_serial: AtomicU64,
    client: Mutex<Option<reqwest::Client>>,
    /// `None` starts the real host, next to the shell's executable.
    command: Option<HostCommand>,
}

/// A stream, by the page that opened it and the id that page gave it.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct StreamKey {
    page: String,
    stream: u64,
}

/// A stream the page has opened. `task` is `None` while the shell waits
/// for the host to answer; then it is the task passing on the lines.
struct OpenStream {
    serial: u64,
    task: Option<JoinHandle<()>>,
}

impl AgentHostState {
    /// A state whose host is started with `command`, for tests.
    #[cfg(test)]
    pub fn with_command(command: impl Fn() -> Command + Send + Sync + 'static) -> Self {
        Self {
            command: Some(Box::new(command)),
            ..Self::default()
        }
    }

    /// The client every call to the host uses: loopback only, so no proxy,
    /// no redirects, and a time limit on connecting.
    fn client(&self) -> Result<reqwest::Client, HostRefusal> {
        let mut client = self.client.lock().map_err(|_| poisoned())?;
        if let Some(client) = client.as_ref() {
            return Ok(client.clone());
        }
        let built = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(CONNECT_TIMEOUT)
            .build()
            .map_err(unavailable)?;
        *client = Some(built.clone());
        Ok(built)
    }

    /// Notes a stream the page is opening, before the host is called, so
    /// the page can end it at once. Answers the stream's serial.
    fn open_stream(&self, key: &StreamKey) -> Result<u64, HostRefusal> {
        let mut streams = self.streams.lock().map_err(|_| poisoned())?;
        if streams.contains_key(key) {
            return Err(HostRefusal::new(
                "stream_in_use",
                format!("the page already has a stream {}", key.stream),
            ));
        }
        let serial = self.next_serial.fetch_add(1, Ordering::Relaxed);
        streams.insert(key.clone(), OpenStream { serial, task: None });
        Ok(serial)
    }

    /// Forgets a stream that has ended on its own, unless the page has
    /// since opened another under the same id.
    fn forget_stream(&self, key: &StreamKey, serial: u64) {
        if let Ok(mut streams) = self.streams.lock()
            && streams.get(key).is_some_and(|open| open.serial == serial)
        {
            streams.remove(key);
        }
    }

    /// Ends the streams `ends` picks. Aborting a stream's task drops its
    /// response, which hangs up on the host; a stream the host hasn't
    /// answered yet is hung up on when it answers.
    fn end_streams(&self, ends: impl Fn(&StreamKey) -> bool) {
        let Ok(mut streams) = self.streams.lock() else {
            return;
        };
        streams.retain(|key, open| {
            if !ends(key) {
                return true;
            }
            if let Some(task) = open.task.take() {
                task.abort();
            }
            false
        });
    }
}

/// Why a call didn't reach the host: `unknown_route`, `host_unavailable`,
/// `stream_in_use`, `stream_ended` or `io`, and a message for the log. The
/// host's own refusals are answers. No message contains the launch token.
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

/// What `agent_host_stream` answers: the page's id for the stream, whose
/// lines then come on the channel, or the host's answer when it refused it.
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

/// Calls a JSON route of the host with `body` (`{}` for a POST when there
/// is none, or it is `null`; a GET takes none).
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

/// Calls a stream route of the host, as the page's stream `stream`. Its
/// lines go to `channel` until the host ends the stream, the page ends it
/// with `agent_host_stream_end`, or the page reloads or closes.
#[tauri::command]
pub async fn agent_host_stream<R: Runtime>(
    webview: Webview<R>,
    route: String,
    stream: u64,
    body: Option<Value>,
    channel: Channel<StreamMessage>,
) -> Result<StreamStart, HostRefusal> {
    let route = named_route(&route, Answer::Stream)?;
    let app = webview.app_handle().clone();
    let key = StreamKey {
        page: webview.label().to_owned(),
        stream,
    };
    let serial = app.state::<AgentHostState>().open_stream(&key)?;
    let response = match send(&app, route, body).await {
        Ok(response) => response,
        Err(refusal) => {
            app.state::<AgentHostState>().forget_stream(&key, serial);
            return Err(refusal);
        }
    };
    if response.status() != reqwest::StatusCode::OK {
        app.state::<AgentHostState>().forget_stream(&key, serial);
        let answer = read_answer(response).await?;
        return Ok(StreamStart::Refused { answer });
    }
    let state = app.state::<AgentHostState>();
    let mut streams = state.streams.lock().map_err(|_| poisoned())?;
    // The page may have ended the stream, or reloaded, while the host
    // answered. Then the response is dropped here, which hangs up.
    let Some(open) = streams.get_mut(&key).filter(|open| open.serial == serial) else {
        return Err(HostRefusal::new(
            "stream_ended",
            "the page ended the stream before the agent host opened it",
        ));
    };
    let task =
        tauri::async_runtime::spawn(forward_lines(app.clone(), key, serial, response, channel));
    open.task = Some(task);
    Ok(StreamStart::Opened { stream })
}

/// Ends a stream the page no longer reads. Hanging up tells the host the
/// caller has gone. An id that has already ended is fine.
#[tauri::command]
pub fn agent_host_stream_end<R: Runtime>(webview: Webview<R>, stream: u64) {
    let page = webview.label();
    webview
        .state::<AgentHostState>()
        .end_streams(|key| key.page == page && key.stream == stream);
}

/// Ends every stream of the page `page`. The shell calls this when that
/// page starts loading another document, or its window closes.
pub fn end_page_streams<R: Runtime>(app: &AppHandle<R>, page: &str) {
    if let Some(state) = app.try_state::<AgentHostState>() {
        state.end_streams(|key| key.page == page);
    }
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
        let command = match &state.command {
            Some(command) => command(),
            None => real_host_command(&app)?,
        };
        let started = AgentHost::start(command, START_WAIT).map_err(unavailable)?;
        let handshake = started.handshake().clone();
        *host = Some(started);
        Ok(handshake)
    })
    .await
    .map_err(|error| HostRefusal::new("io", error))?
}

/// The host next to the shell's executable, for the CLI's profile.
fn real_host_command<R: Runtime>(app: &AppHandle<R>) -> Result<Command, HostRefusal> {
    let profile = cli_profile(app).map_err(|error| HostRefusal::new("io", error))?;
    let shell = std::env::current_exe().map_err(|error| HostRefusal::new("io", error))?;
    let executable = executable_beside(&shell).map_err(unavailable)?;
    Ok(host_command(&executable, Path::new(&profile.root)))
}

fn unavailable(error: impl std::fmt::Display) -> HostRefusal {
    HostRefusal::new("host_unavailable", error)
}

/// Sends one request to the host, with the launch token and no `Origin`.
/// A JSON route has [`REQUEST_TIMEOUT`] for its whole answer.
async fn send<R: Runtime>(
    app: &AppHandle<R>,
    route: Route,
    body: Option<Value>,
) -> Result<reqwest::Response, HostRefusal> {
    let body = request_body(route, body)?;
    let handshake = running_host(app).await?;
    let client = app.state::<AgentHostState>().client()?;
    let url = format!("{}{}", handshake.url(), route.path);
    let mut request = match body {
        None => client.get(url),
        Some(bytes) => client
            .post(url)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(bytes),
    };
    if route.answer == Answer::Json {
        request = request.timeout(REQUEST_TIMEOUT);
    }
    request
        .bearer_auth(handshake.token())
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                unavailable("the agent host didn't answer in time")
            } else {
                unavailable("the agent host didn't answer")
            }
        })
}

/// The bytes a route sends: none for a GET, and the body as JSON for a
/// POST, `{}` when there is none or it is `null`. A GET given a body is
/// refused rather than sent without it.
fn request_body(route: Route, body: Option<Value>) -> Result<Option<Vec<u8>>, HostRefusal> {
    let body = body.filter(|body| !body.is_null());
    match route.method {
        Method::Get if body.is_some() => Err(HostRefusal::new(
            "io",
            "a GET route of the agent host takes no body",
        )),
        Method::Get => Ok(None),
        Method::Post => {
            let body = body.unwrap_or_else(|| Value::Object(serde_json::Map::new()));
            serde_json::to_vec(&body)
                .map(Some)
                .map_err(|error| HostRefusal::new("io", error))
        }
    }
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
    if bytes.is_empty() {
        return Ok(HostAnswer {
            status,
            body: Value::Null,
        });
    }
    let body = serde_json::from_slice(&bytes)
        .map_err(|_| HostRefusal::new("io", "the agent host's answer isn't JSON"))?;
    Ok(HostAnswer { status, body })
}

/// Passes the stream's lines to the page, then how it ended, and forgets
/// the stream. Dropping the response hangs up on the host.
async fn forward_lines<R: Runtime>(
    app: AppHandle<R>,
    key: StreamKey,
    serial: u64,
    mut response: reqwest::Response,
    channel: Channel<StreamMessage>,
) {
    let ending = read_lines(&mut response, &channel).await;
    drop(response);
    // The page may have gone; then nobody hears how it ended.
    let _ = channel.send(ending);
    app.state::<AgentHostState>().forget_stream(&key, serial);
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

#[cfg(test)]
#[path = "agent_host_tests.rs"]
mod tests;
