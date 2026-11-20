//! Requirement `engine-commands`: the commands against a fake engine served
//! on loopback by the test itself, which records each request and when the
//! shell hangs up.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::time::Duration;

use halonic_agent_host::read_handshake;
use serde_json::{Value, json};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::test::{MockRuntime, mock_app};
use tauri::webview::WebviewWindowBuilder;
use tauri::{App, Manager, Webview, WebviewUrl};

use super::{
    EngineAnswer, EngineRefusal, EngineState, EngineStreamStart, end_page_streams, engine_request,
    engine_stream, engine_stream_end,
};

/// A made-up token of the right form, 43 base64url characters.
const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234";

/// Long enough for a thread to start on a busy CI machine.
const WAIT: Duration = Duration::from_secs(20);

/// What the fake engine saw.
#[derive(Debug, PartialEq, Eq)]
enum Seen {
    /// A request, as `"<METHOD> <path>"`, with its `Authorization` and
    /// `Origin` headers and its body.
    Request {
        route: String,
        authorization: String,
        origin: Option<String>,
        body: String,
    },
    /// The shell hung up on the stream of this path.
    HungUp(String),
}

/// A fake engine on loopback, answering each path as the real one might.
struct FakeEngine {
    port: u16,
    seen: Receiver<Seen>,
}

impl FakeEngine {
    fn serve(redirect_to: u16) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback port");
        let port = listener.local_addr().expect("its address").port();
        let (seen_sender, seen) = channel();
        std::thread::spawn(move || {
            for connection in listener.incoming().flatten() {
                let seen = seen_sender.clone();
                std::thread::spawn(move || answer(connection, &seen, redirect_to));
            }
        });
        Self { port, seen }
    }

    fn next(&self) -> Seen {
        self.seen
            .recv_timeout(WAIT)
            .expect("the fake engine sees it")
    }

    fn next_route(&self) -> String {
        match self.next() {
            Seen::Request { route, .. } => route,
            Seen::HungUp(path) => panic!("a request, not a hang-up on {path}"),
        }
    }
}

/// Reads one request and answers it by its path.
fn answer(connection: TcpStream, seen: &Sender<Seen>, redirect_to: u16) {
    let mut reader = BufReader::new(connection.try_clone().expect("a second handle"));
    let mut request_line = String::new();
    let _ = reader.read_line(&mut request_line);
    let mut headers = HashMap::new();
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
            break;
        }
        if let Some((name, value)) = line.trim_end().split_once(": ") {
            headers.insert(name.to_ascii_lowercase(), value.to_owned());
        }
    }
    let length = headers
        .get("content-length")
        .and_then(|length| length.parse().ok())
        .unwrap_or(0);
    let mut body = vec![0; length];
    let _ = reader.read_exact(&mut body);
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or_default().to_owned();
    let _ = seen.send(Seen::Request {
        route: format!("{method} {path}"),
        authorization: headers.remove("authorization").unwrap_or_default(),
        origin: headers.remove("origin"),
        body: String::from_utf8_lossy(&body).into_owned(),
    });
    let mut connection = connection;
    match path.as_str() {
        "/api/hello" => respond(&mut connection, 200, r#"{"runExecutorVersion":2}"#),
        "/api/runs" => respond(&mut connection, 201, r#"{"runId":"r1","status":"running"}"#),
        "/api/routines" => respond(&mut connection, 200, "not JSON"),
        "/api/waiting-runs" => {
            let _ = write!(
                connection,
                "HTTP/1.1 307 X\r\nLocation: http://127.0.0.1:{redirect_to}/steal\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            );
        }
        "/api/runs/r1/events?after=0" => {
            let events =
                "id: 1\nevent: run\ndata: {\"seq\":1}\n\n: quiet\n\nevent: end\ndata: {}\n\n";
            open_events(&mut connection, events);
        }
        "/api/runs/big/events?after=0" => {
            let events = format!("event: run\ndata: {}\n\n", "x".repeat(1024 * 1024));
            open_events(&mut connection, &events);
        }
        "/api/run-updates" => {
            open_events(
                &mut connection,
                "event: changed\ndata: {\"runId\":\"r1\"}\n\n",
            );
            let mut rest = Vec::new();
            let _ = reader.read_to_end(&mut rest);
            let _ = seen.send(Seen::HungUp(path));
        }
        _ => respond(
            &mut connection,
            404,
            r#"{"error":{"code":"run_not_found"}}"#,
        ),
    }
}

fn respond(connection: &mut TcpStream, status: u16, body: &str) {
    let _ = write!(
        connection,
        "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

fn open_events(connection: &mut TcpStream, events: &str) {
    let _ = write!(
        connection,
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n{events}"
    );
    let _ = connection.flush();
}

/// A listener that only records whether anything connected to it.
fn bystander() -> (u16, Receiver<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback port");
    let port = listener.local_addr().expect("its address").port();
    let (reached, heard) = channel();
    std::thread::spawn(move || {
        for _ in listener.incoming() {
            let _ = reached.send(());
        }
    });
    (port, heard)
}

/// A shell on the mock runtime with its main window, connected to `fake`.
fn shell(fake: &FakeEngine) -> App<MockRuntime> {
    let app = mock_app();
    app.manage(EngineState::default());
    WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
        .build()
        .expect("the main window opens");
    let line = format!(
        r#"{{"url":"http://127.0.0.1:{}","token":"{TOKEN}"}}"#,
        fake.port
    );
    let handshake = read_handshake(&line).expect("a valid handshake");
    app.state::<EngineState>().connect("main", handshake);
    app
}

fn page(app: &App<MockRuntime>) -> Webview<MockRuntime> {
    app.get_webview_window("main")
        .expect("the main window")
        .as_ref()
        .clone()
}

fn request(
    app: &App<MockRuntime>,
    route: &str,
    params: Value,
    body: Option<Value>,
) -> Result<EngineAnswer, EngineRefusal> {
    tauri::async_runtime::block_on(engine_request(
        page(app),
        route.to_owned(),
        Some(params),
        body,
    ))
}

/// Opens the page's stream `stream`; its messages arrive on the receiver.
fn open_stream(
    app: &App<MockRuntime>,
    route: &str,
    stream: u64,
    params: Value,
) -> (Result<EngineStreamStart, EngineRefusal>, Receiver<Value>) {
    let (messages, received) = channel();
    let channel = Channel::new(move |body| {
        let message = match body {
            InvokeResponseBody::Json(text) => serde_json::from_str(&text),
            InvokeResponseBody::Raw(bytes) => serde_json::from_slice(&bytes),
        };
        let _ = messages.send(message.expect("a JSON message"));
        Ok(())
    });
    let opened = tauri::async_runtime::block_on(engine_stream(
        page(app),
        route.to_owned(),
        stream,
        Some(params),
        channel,
    ));
    (opened, received)
}

fn as_json(value: &impl serde::Serialize) -> Value {
    serde_json::to_value(value).expect("serializes")
}

#[test]
fn engine_commands_call_the_engine_with_the_token_and_never_show_it() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);

    let answer = request(&app, "GET /api/hello", json!({}), None).expect("the engine answers");
    assert_eq!(
        as_json(&answer),
        json!({"status": 200, "body": {"runExecutorVersion": 2}})
    );
    assert_eq!(
        fake.next(),
        Seen::Request {
            route: "GET /api/hello".to_owned(),
            authorization: format!("Bearer {TOKEN}"),
            origin: None,
            body: String::new(),
        }
    );

    let refusal = request(&app, "GET /api/routines", json!({}), None).expect_err("not JSON");
    let refusal = as_json(&refusal);
    assert_eq!(refusal["kind"], "io");
    assert!(!refusal.to_string().contains(TOKEN));
}

#[test]
fn engine_commands_refuse_bad_params_before_any_request() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let cases = [
        ("GET http://example.com/", json!({}), "unknown_route"),
        (
            "POST /api/runs/{run}/cancel",
            json!({"run": "../hello"}),
            "bad_param",
        ),
        ("POST /api/runs/{run}/cancel", json!({}), "bad_param"),
        ("POST /api/runs/{run}/cancel", json!(["r1"]), "bad_param"),
        ("GET /api/hello", json!({"run": "r1"}), "bad_param"),
    ];
    for (route, params, kind) in cases {
        let refusal = as_json(&request(&app, route, params, None).expect_err(route));
        assert_eq!(refusal["kind"], kind, "{route}: {refusal}");
    }
    let refusal = as_json(
        &request(
            &app,
            "POST /api/runs/{run}/cancel",
            json!({"run": ".."}),
            None,
        )
        .expect_err("refused"),
    );
    assert_eq!(refusal["param"], "run");
    assert!(
        !refusal["message"]
            .as_str()
            .unwrap_or_default()
            .contains(".."),
        "{refusal}"
    );

    // The first request the engine sees is the one after the refusals.
    let _ = request(&app, "GET /api/hello", json!({}), None);
    assert_eq!(fake.next_route(), "GET /api/hello");
}

#[test]
fn engine_commands_send_bodies_within_the_limit_and_none_for_a_get() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);

    let answer = request(&app, "POST /api/runs", json!({}), None).expect("answered");
    assert_eq!(as_json(&answer)["status"], 201);
    let Seen::Request { body, .. } = fake.next() else {
        panic!("a request");
    };
    assert_eq!(body, "{}");

    let refusal = request(&app, "GET /api/hello", json!({}), Some(json!({"x": 1})));
    assert_eq!(
        as_json(&refusal.expect_err("a GET takes no body"))["kind"],
        "bad_body"
    );
    let large = json!({"input": "x".repeat(1024 * 1024)});
    let refusal = request(&app, "POST /api/runs", json!({}), Some(large));
    assert_eq!(
        as_json(&refusal.expect_err("too large"))["kind"],
        "bad_body"
    );

    let _ = request(&app, "GET /api/hello", json!({}), None);
    assert_eq!(fake.next_route(), "GET /api/hello");
}

#[test]
fn engine_commands_refuse_every_call_while_no_engine_runs() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    app.state::<EngineState>().disconnect("main");
    let refusal = request(&app, "GET /api/hello", json!({}), None).expect_err("no engine");
    assert_eq!(as_json(&refusal)["kind"], "engine_unavailable");
    let (opened, _) = open_stream(&app, "GET /api/run-updates", 1, json!({}));
    assert_eq!(
        as_json(&opened.expect_err("no engine"))["kind"],
        "engine_unavailable"
    );
    // A refused stream doesn't count against the page.
    assert_eq!(app.state::<EngineState>().streams.count(), 0);
}

#[test]
fn engine_commands_never_follow_a_redirect_with_the_token() {
    let (elsewhere, heard) = bystander();
    let fake = FakeEngine::serve(elsewhere);
    let app = shell(&fake);
    let answer = request(&app, "GET /api/waiting-runs", json!({}), None).expect("answered");
    assert_eq!(as_json(&answer), json!({"status": 307, "body": null}));
    assert!(heard.recv_timeout(Duration::from_millis(300)).is_err());
}

#[test]
fn engine_commands_pass_on_a_streams_events_then_its_end() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let params = json!({"run": "r1", "after": 0});
    let (opened, events) = open_stream(&app, "GET /api/runs/{run}/events", 1, params);
    assert_eq!(as_json(&opened.expect("opened")), json!({"stream": 1}));
    let received: Vec<Value> = (0..3)
        .map(|_| events.recv_timeout(WAIT).expect("a message"))
        .collect();
    assert_eq!(
        received,
        [
            json!({"type": "event", "event": "run", "data": "{\"seq\":1}", "id": "1"}),
            json!({"type": "event", "event": "end", "data": "{}"}),
            json!({"type": "end"}),
        ]
    );

    let missing = json!({"run": "missing", "after": 0});
    let (refused, _) = open_stream(&app, "GET /api/runs/{run}/events", 2, missing);
    let refused = as_json(&refused.expect("the engine's answer"));
    assert_eq!(refused["answer"]["status"], 404, "{refused}");
}

#[test]
fn engine_commands_end_a_stream_whose_event_is_too_large() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let params = json!({"run": "big", "after": 0});
    let (opened, events) = open_stream(&app, "GET /api/runs/{run}/events", 1, params);
    assert!(opened.is_ok());
    let message = events.recv_timeout(WAIT).expect("a message");
    assert_eq!(message["type"], "failed", "{message}");
}

#[test]
fn engine_commands_cap_the_streams_a_page_has_open() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let mut open = Vec::new();
    for stream in 0..16 {
        let (opened, events) = open_stream(&app, "GET /api/run-updates", stream, json!({}));
        assert!(opened.is_ok(), "stream {stream}");
        open.push(events);
    }
    let (refused, _) = open_stream(&app, "GET /api/run-updates", 16, json!({}));
    assert_eq!(
        as_json(&refused.expect_err("one too many"))["kind"],
        "too_many_streams"
    );
    let (in_use, _) = open_stream(&app, "GET /api/run-updates", 3, json!({}));
    assert_eq!(
        as_json(&in_use.expect_err("in use"))["kind"],
        "stream_in_use"
    );
}

/// One way a stream ends: by the page, by a reload, or by the engine going.
type EndStream = dyn Fn(&App<MockRuntime>, u64);

#[test]
fn engine_commands_hang_up_when_the_page_ends_reloads_or_the_engine_goes() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let ends: [&EndStream; 3] = [
        &|app, stream| engine_stream_end(page(app), stream),
        &|app, _| end_page_streams(app, "main"),
        &|app, _| app.state::<EngineState>().disconnect("main"),
    ];
    for (stream, end) in (0_u64..).zip(ends) {
        let app_state = app.state::<EngineState>();
        if stream > 0 {
            let line = format!(
                r#"{{"url":"http://127.0.0.1:{}","token":"{TOKEN}"}}"#,
                fake.port
            );
            app_state.connect("main", read_handshake(&line).expect("a valid handshake"));
        }
        let (opened, events) = open_stream(&app, "GET /api/run-updates", stream, json!({}));
        assert!(opened.is_ok());
        events.recv_timeout(WAIT).expect("the first event");
        assert_eq!(fake.next_route(), "GET /api/run-updates");

        end(&app, stream);
        assert_eq!(fake.next(), Seen::HungUp("/api/run-updates".to_owned()));
        assert_eq!(app_state.streams.count(), 0);
    }
}
