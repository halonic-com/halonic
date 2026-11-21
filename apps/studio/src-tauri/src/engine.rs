//! The `engine_*` commands (B1 step 4, HAL-14219): the page's way to the
//! engine process that runs its workspace's runs and routines (design note
//! D3 of HAL-14206). The engine serves on loopback and takes only requests
//! with its launch token, which stays in the shell. The page names a route
//! of the shell's table and sends the route's params apart; the shell
//! checks them, builds the path and makes the call. So the token only ever
//! goes to the engine's own address, and only for a route of the table.
//!
//! The shell knows an engine for a window once it has read that engine's
//! handshake ([`EngineState::connect`]). Until then, and for a window with
//! no engine, every call is refused as `engine_unavailable`, and the page
//! runs its own engine as before.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use halonic_agent_host::{Answer, Handshake};
use serde::Serialize;
use serde_json::{Map, Value};
use tauri::ipc::Channel;
use tauri::{Manager, Runtime, Webview};
use tauri_plugin_http::reqwest;

use crate::engine_routes::{EngineRoute, engine_path, find_engine_route};
use crate::page_streams::{OpenRefusal, PageStreams, StreamKey};

#[path = "engine_calls.rs"]
mod calls;
use calls::{forward_events, read_answer, request_body, send};

/// How many streams one page may have open: a run's events for each run it
/// shows, and the run updates.
const STREAMS_PER_PAGE: usize = 16;

/// How long connecting to the engine on loopback may take. A stream has no
/// other limit: it may stay quiet for as long as a run waits.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// The engine of each window, the streams pages have open on them, and the
/// one HTTP client every call uses.
pub struct EngineState {
    /// By the label of the window whose workspace the engine runs.
    connections: Mutex<HashMap<String, Handshake>>,
    streams: PageStreams,
    client: Mutex<Option<reqwest::Client>>,
}

impl Default for EngineState {
    fn default() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
            streams: PageStreams::new(STREAMS_PER_PAGE),
            client: Mutex::new(None),
        }
    }
}

impl EngineState {
    /// Notes the engine that runs `window`'s workspace, from its handshake,
    /// which `read_handshake` has checked: a loopback address and a token.
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "the shell starts engines in B1 step 5 (HAL-14220)"
        )
    )]
    pub fn connect(&self, window: &str, handshake: Handshake) {
        if let Ok(mut connections) = self.connections.lock() {
            connections.insert(window.to_owned(), handshake);
        }
    }

    /// Forgets `window`'s engine, which has stopped, and ends the streams
    /// the window had open on it.
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "the shell starts engines in B1 step 5 (HAL-14220)"
        )
    )]
    pub fn disconnect(&self, window: &str) {
        if let Ok(mut connections) = self.connections.lock() {
            connections.remove(window);
        }
        self.streams.end(|key| key.page == window);
    }

    fn connection(&self, window: &str) -> Result<Handshake, EngineRefusal> {
        let connections = self.connections.lock().map_err(|_| poisoned())?;
        connections.get(window).cloned().ok_or_else(|| {
            EngineRefusal::new(
                "engine_unavailable",
                "no engine runs for this window's workspace",
            )
        })
    }

    /// The client every call uses: loopback only, so no proxy, no
    /// redirects, and a time limit on connecting.
    fn client(&self) -> Result<reqwest::Client, EngineRefusal> {
        let mut client = self.client.lock().map_err(|_| poisoned())?;
        if let Some(client) = client.as_ref() {
            return Ok(client.clone());
        }
        let built = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(CONNECT_TIMEOUT)
            .build()
            .map_err(|_| unavailable())?;
        *client = Some(built.clone());
        Ok(built)
    }
}

/// Why a call didn't reach the engine: `unknown_route`, `bad_param` (with
/// the `param` that failed), `bad_body`, `engine_unavailable`,
/// `stream_in_use`, `too_many_streams`, `stream_ended` or `io`, and a
/// message for the log. The engine's own refusals are answers. No refusal
/// contains the token or repeats a value the page sent.
#[derive(Debug, Serialize)]
pub struct EngineRefusal {
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    param: Option<&'static str>,
    message: String,
}

impl EngineRefusal {
    fn new(kind: &'static str, message: impl std::fmt::Display) -> Self {
        Self {
            kind,
            param: None,
            message: message.to_string(),
        }
    }
}

/// The engine's answer to a JSON route: its status and body (`null` when
/// the body is empty).
#[derive(Debug, Serialize)]
pub struct EngineAnswer {
    status: u16,
    body: Value,
}

/// What `engine_stream` answers: the page's id for the stream, whose
/// events then come on the channel, or the engine's answer when it refused.
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum EngineStreamStart {
    Opened { stream: u64 },
    Refused { answer: EngineAnswer },
}

/// One message on a stream's channel: an event as the engine sent it, its
/// data left as text, then `end`, or `failed` when the stream broke off.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EngineStreamMessage {
    Event {
        event: String,
        data: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },
    End,
    Failed {
        message: String,
    },
}

/// Calls a JSON route of the window's engine with `params` and `body`
/// (`{}` for a POST when there is none, or it is `null`; a GET takes none).
#[tauri::command]
pub async fn engine_request<R: Runtime>(
    webview: Webview<R>,
    route: String,
    params: Option<Value>,
    body: Option<Value>,
) -> Result<EngineAnswer, EngineRefusal> {
    let route = named_route(&route, Answer::Json)?;
    let path = checked_path(route, params)?;
    let body = request_body(route, body)?;
    let response = send(&webview, route, &path, body).await?;
    read_answer(response).await
}

/// Calls a stream route of the window's engine, as the page's stream
/// `stream`. Its events go to `channel` until the engine ends the stream,
/// the page ends it with `engine_stream_end`, or the page reloads or closes.
#[tauri::command]
pub async fn engine_stream<R: Runtime>(
    webview: Webview<R>,
    route: String,
    stream: u64,
    params: Option<Value>,
    channel: Channel<EngineStreamMessage>,
) -> Result<EngineStreamStart, EngineRefusal> {
    let route = named_route(&route, Answer::Stream)?;
    let path = checked_path(route, params)?;
    let key = StreamKey {
        page: webview.label().to_owned(),
        stream,
    };
    let state = webview.state::<EngineState>();
    let serial = state.streams.open(&key).map_err(open_refusal)?;
    let response = match send(&webview, route, &path, None).await {
        Ok(response) => response,
        Err(refusal) => {
            state.streams.forget(&key, serial);
            return Err(refusal);
        }
    };
    if response.status() != reqwest::StatusCode::OK {
        state.streams.forget(&key, serial);
        let answer = read_answer(response).await?;
        return Ok(EngineStreamStart::Refused { answer });
    }
    let app = webview.app_handle().clone();
    let task_key = key.clone();
    // The page may have ended the stream, or reloaded, while the engine
    // answered. Then no task starts, and dropping the response hangs up.
    let started = state.streams.start(&key, serial, move || {
        tauri::async_runtime::spawn(async move {
            forward_events(&app, task_key, serial, response, channel).await;
        })
    });
    if !started {
        return Err(EngineRefusal::new(
            "stream_ended",
            "the page ended the stream before the engine opened it",
        ));
    }
    Ok(EngineStreamStart::Opened { stream })
}

/// Ends a stream the page no longer reads. Hanging up tells the engine the
/// caller has gone. An id that has already ended is fine.
#[tauri::command]
pub fn engine_stream_end<R: Runtime>(webview: Webview<R>, stream: u64) {
    let page = webview.label();
    webview
        .state::<EngineState>()
        .streams
        .end(|key| key.page == page && key.stream == stream);
}

/// Ends every engine stream of the page `page`. The shell calls this when
/// that page starts loading another document, or its window closes.
pub fn end_page_streams<R: Runtime>(app: &impl Manager<R>, page: &str) {
    if let Some(state) = app.try_state::<EngineState>() {
        state.streams.end(|key| key.page == page);
    }
}

/// The route the page names. The refusal doesn't repeat the name.
fn named_route(name: &str, answer: Answer) -> Result<EngineRoute, EngineRefusal> {
    find_engine_route(name, answer)
        .ok_or_else(|| EngineRefusal::new("unknown_route", "that isn't a route of the engine"))
}

/// The route's path with the page's params, every one checked.
fn checked_path(route: EngineRoute, params: Option<Value>) -> Result<String, EngineRefusal> {
    let params = match params {
        None | Some(Value::Null) => Map::new(),
        Some(Value::Object(params)) => params,
        Some(_) => {
            return Err(EngineRefusal::new(
                "bad_param",
                "the params aren't an object",
            ));
        }
    };
    engine_path(route, &params).map_err(|bad| EngineRefusal {
        kind: "bad_param",
        param: bad.param,
        message: bad.message,
    })
}

fn open_refusal(refusal: OpenRefusal) -> EngineRefusal {
    match refusal {
        OpenRefusal::InUse => EngineRefusal::new(
            "stream_in_use",
            "the page already has a stream with this id",
        ),
        OpenRefusal::TooMany => EngineRefusal::new(
            "too_many_streams",
            format!("a page may have {STREAMS_PER_PAGE} engine streams open at once"),
        ),
        OpenRefusal::Poisoned => poisoned(),
    }
}

fn poisoned() -> EngineRefusal {
    EngineRefusal::new(
        "io",
        "the engine's state was left broken by an earlier failure",
    )
}

fn unavailable() -> EngineRefusal {
    EngineRefusal::new("engine_unavailable", "the engine didn't answer")
}

#[cfg(test)]
#[path = "engine_tests.rs"]
mod tests;
