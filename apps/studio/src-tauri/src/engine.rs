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
use crate::page_calls::{CallInUse, CallKey, PageCalls};
use crate::page_streams::{OpenRefusal, PageStreams, StreamKey};

#[path = "engine_calls.rs"]
mod calls;
use calls::{
    OPENING_TIMEOUT, Opening, forward_events, open_stream, read_answer, request_body, send,
};

#[path = "engine_chat_stream.rs"]
pub mod chat_stream;

/// How many streams one page may have open: a run's events for each run it
/// shows, and the run updates.
const STREAMS_PER_PAGE: usize = 16;

/// How long connecting to the engine on loopback may take. Once a stream is
/// open it has no limit: it may stay quiet for as long as a run waits.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// The engine of each window, the calls and streams pages have open on
/// them, and the one HTTP client every call uses.
pub struct EngineState {
    /// By the label of the window whose workspace the engine runs.
    connections: Mutex<HashMap<String, Handshake>>,
    calls: PageCalls,
    streams: PageStreams,
    client: Mutex<Option<reqwest::Client>>,
    /// How long a stream route's opening answer may take.
    stream_opening_limit: Duration,
}

impl Default for EngineState {
    fn default() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
            calls: PageCalls::default(),
            streams: PageStreams::new(STREAMS_PER_PAGE),
            client: Mutex::new(None),
            stream_opening_limit: OPENING_TIMEOUT,
        }
    }
}

impl EngineState {
    /// A state whose streams' opening answers have `limit`, so a test
    /// needn't wait the real 120 s.
    #[cfg(test)]
    fn with_stream_opening_limit(limit: Duration) -> Self {
        Self {
            stream_opening_limit: limit,
            ..Self::default()
        }
    }

    /// Notes the engine that runs `window`'s workspace, from its handshake,
    /// which `read_handshake` has checked: a loopback address and a token.
    /// A lock an earlier failure left broken is refused, not skipped.
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "the shell starts engines in B1 step 5 (HAL-14220)"
        )
    )]
    pub fn connect(&self, window: &str, handshake: Handshake) -> Result<(), EngineRefusal> {
        let mut connections = self.connections.lock().map_err(|_| poisoned())?;
        connections.insert(window.to_owned(), handshake);
        Ok(())
    }

    /// Forgets `window`'s engine, which has stopped, and ends the streams
    /// the window had open on it. The streams end even when an earlier
    /// failure left the lock broken; that is then refused.
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "the shell starts engines in B1 step 5 (HAL-14220)"
        )
    )]
    pub fn disconnect(&self, window: &str) -> Result<(), EngineRefusal> {
        let forgotten = self
            .connections
            .lock()
            .map(|mut connections| {
                connections.remove(window);
            })
            .map_err(|_| poisoned());
        self.streams.end(|key| key.page == window);
        forgotten
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
/// `call_in_use`, `call_ended`, `stream_in_use`, `too_many_streams`,
/// `stream_ended` or `io`, and a message for the log. The engine's own refusals are answers. No refusal
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

/// What `engine_stream` and `engine_chat_stream` answer: the page's id for
/// the stream, whose events or lines then come on the channel, or the
/// engine's answer when it refused (or, for a chat turn, answered whole).
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
/// (`{}` for a POST when there is none, or it is `null`; a GET takes none),
/// as the page's call `call`. The call ends with the engine's answer, a
/// refusal, or the page's `engine_request_end`; a page that reloads or
/// closes ends its calls too. Ending a call hangs up on the engine, which
/// then stops what it was doing for it, such as a model call.
#[tauri::command]
pub async fn engine_request<R: Runtime>(
    webview: Webview<R>,
    route: String,
    call: u64,
    params: Option<Value>,
    body: Option<Value>,
) -> Result<EngineAnswer, EngineRefusal> {
    let route = named_route(&route, Answer::Json)?;
    let path = checked_path(route, params)?;
    let body = request_body(route, body)?;
    let key = CallKey {
        page: webview.label().to_owned(),
        call,
    };
    let state = webview.state::<EngineState>();
    let caller = webview.clone();
    let started = state
        .calls
        .start(key.clone(), move || {
            tauri::async_runtime::spawn(async move {
                let response = send(&caller, route, &path, body).await?;
                read_answer(response).await
            })
        })
        .map_err(|CallInUse| {
            EngineRefusal::new("call_in_use", "the page already has a call with this id")
        })?;
    let answer = started.task.await;
    state.calls.forget(&key, started.serial);
    answer.unwrap_or_else(|_| {
        Err(EngineRefusal::new(
            "call_ended",
            "the page ended the call before the engine answered",
        ))
    })
}

/// Ends a call the page no longer waits for. Hanging up tells the engine
/// the caller has gone. An id that is done is fine.
#[tauri::command]
pub fn engine_request_end<R: Runtime>(webview: Webview<R>, call: u64) {
    let page = webview.label();
    webview
        .state::<EngineState>()
        .calls
        .end(|key| key.page == page && key.call == call);
}

/// Calls a stream route of the window's engine, as the page's stream
/// `stream`. Its events go to `channel` until the engine ends the stream,
/// the page ends it with `engine_stream_end`, or the page reloads or closes.
/// An engine that hasn't opened the stream, or finished refusing it, within
/// 120 s is refused as `engine_unavailable`.
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
    let opening = open_stream(&webview, route, &path, state.stream_opening_limit).await;
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

/// Ends every engine call and stream of the page `page`. The shell calls
/// this when that page starts loading another document, or its window
/// closes.
pub fn end_page<R: Runtime>(app: &impl Manager<R>, page: &str) {
    if let Some(state) = app.try_state::<EngineState>() {
        state.calls.end(|key| key.page == page);
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
