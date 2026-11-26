//! Requirement `deployment-call-commands`: the streams a page opens to an
//! owner server, against a fake server the test serves on loopback. The
//! keychain and the connect check are left out: each test hands the shell
//! the request they would make, so it can also end or reload the page
//! while the shell is still preparing it.

use std::collections::HashMap;
use std::future::{Future, ready};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::time::Duration;

use halonic_owner_sign_in::owner_origin;
use serde_json::{Value, json};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::test::{MockRuntime, mock_app};
use tauri::webview::WebviewWindowBuilder;
use tauri::{App, Manager, Webview, WebviewUrl};
use tauri_plugin_http::reqwest;

use super::{
    DeploymentRefusal, DeploymentState, DeploymentStreamStart, deployment_stream_end, end_origin,
    end_page, open_stream,
};

/// Long enough for a thread to start on a busy CI machine.
const WAIT: Duration = Duration::from_secs(20);

/// What the fake server saw.
#[derive(Debug, PartialEq, Eq)]
enum Seen {
    /// A request for this path, with its headers by lower-case name.
    Request {
        path: String,
        headers: HashMap<String, String>,
    },
    /// The shell hung up on the stream of this path.
    HungUp(String),
}

/// A fake owner server on loopback.
struct FakeServer {
    port: u16,
    seen: Receiver<Seen>,
}

impl FakeServer {
    fn serve() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback port");
        let port = listener.local_addr().expect("its address").port();
        let (seen_sender, seen) = channel();
        std::thread::spawn(move || {
            for connection in listener.incoming().flatten() {
                let seen = seen_sender.clone();
                std::thread::spawn(move || answer(connection, &seen));
            }
        });
        Self { port, seen }
    }

    /// The request the shell would make for `path`, following no redirect
    /// as the pinned client doesn't.
    fn get(&self, path: &str) -> reqwest::RequestBuilder {
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("a client");
        client.get(format!("http://127.0.0.1:{}{path}", self.port))
    }

    fn next(&self) -> Seen {
        self.seen
            .recv_timeout(WAIT)
            .expect("the fake server sees it")
    }
}

/// Reads one request and answers it by its path.
fn answer(connection: TcpStream, seen: &Sender<Seen>) {
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
    let path = request_line
        .split_whitespace()
        .nth(1)
        .unwrap_or_default()
        .to_owned();
    let _ = seen.send(Seen::Request {
        path: path.clone(),
        headers,
    });
    let mut connection = connection;
    if path == "/moved" {
        let _ = write!(
            connection,
            "HTTP/1.1 307 X\r\nLocation: http://127.0.0.1:1/steal\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        );
        return;
    }
    // A stream that sends one event, then stays open until the shell hangs up.
    let _ = write!(
        connection,
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\nid: 1\nevent: run\ndata: {{}}\n\n"
    );
    let _ = connection.flush();
    let mut rest = Vec::new();
    let _ = reader.read_to_end(&mut rest);
    let _ = seen.send(Seen::HungUp(path));
}

/// A shell on the mock runtime with its main window.
fn shell() -> App<MockRuntime> {
    let app = mock_app();
    app.manage(DeploymentState::default());
    WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
        .build()
        .expect("the main window opens");
    app
}

fn page(app: &App<MockRuntime>) -> Webview<MockRuntime> {
    app.get_webview_window("main")
        .expect("the main window")
        .as_ref()
        .clone()
}

/// The canonical origin of the made-up owner server `https://<host>`.
fn origin(host: &str) -> String {
    owner_origin(&format!("https://{host}")).expect("a valid origin")
}

/// Opens the page's stream `stream` with the request `prepare` makes; its
/// messages arrive on the receiver.
fn open(
    app: &App<MockRuntime>,
    origin: &str,
    stream: u64,
    after: Option<u64>,
    prepare: impl Future<Output = Result<reqwest::RequestBuilder, DeploymentRefusal>>,
) -> (
    Result<DeploymentStreamStart, DeploymentRefusal>,
    Receiver<Value>,
) {
    let (messages, received) = channel();
    let channel = Channel::new(move |body| {
        let message = match body {
            InvokeResponseBody::Json(text) => serde_json::from_str(&text),
            InvokeResponseBody::Raw(bytes) => serde_json::from_slice(&bytes),
        };
        let _ = messages.send(message.expect("a JSON message"));
        Ok(())
    });
    let opened = tauri::async_runtime::block_on(open_stream(
        &page(app),
        origin,
        stream,
        after,
        prepare,
        channel,
    ));
    (opened, received)
}

fn as_json(value: &impl serde::Serialize) -> Value {
    serde_json::to_value(value).expect("serializes")
}

fn streams(app: &App<MockRuntime>) -> usize {
    app.state::<DeploymentState>().streams.count()
}

#[test]
fn deployment_call_commands_end_a_stream_the_page_ends_while_the_shell_prepares_it() {
    let fake = FakeServer::serve();
    let app = shell();
    let request = fake.get("/events");
    let ended_meanwhile = async {
        deployment_stream_end(page(&app), 1);
        Ok(request)
    };
    let (opened, _) = open(&app, &origin("halonic.example"), 1, None, ended_meanwhile);
    let refused = as_json(&opened.expect_err("ended before it opened"));
    assert_eq!(refused, json!({"code": "streamEnded"}));
    assert_eq!(streams(&app), 0);
}

#[test]
fn deployment_call_commands_let_a_reloaded_page_open_a_stream_with_the_same_id() {
    let fake = FakeServer::serve();
    let app = shell();
    let origin = origin("halonic.example");
    let request = fake.get("/events");
    let reloaded_meanwhile = async {
        end_page(&app, "main");
        Ok(request)
    };
    let (before_reload, _) = open(&app, &origin, 1, None, reloaded_meanwhile);
    let refused = as_json(&before_reload.expect_err("ended by the reload"));
    assert_eq!(refused, json!({"code": "streamEnded"}));

    let (after_reload, events) = open(&app, &origin, 1, None, ready(Ok(fake.get("/events"))));
    assert_eq!(
        as_json(&after_reload.expect("opened")),
        json!({"stream": 1})
    );
    let event = events.recv_timeout(WAIT).expect("the first event");
    assert_eq!(event["type"], "event", "{event}");
}

#[test]
fn deployment_call_commands_resume_a_stream_after_its_last_event() {
    let fake = FakeServer::serve();
    let app = shell();
    let prepared = ready(Ok(fake.get("/events")));
    let (opened, events) = open(&app, &origin("halonic.example"), 4, Some(7), prepared);
    assert_eq!(as_json(&opened.expect("opened")), json!({"stream": 4}));
    let Seen::Request { headers, .. } = fake.next() else {
        panic!("a request first");
    };
    assert_eq!(headers.get("last-event-id").map(String::as_str), Some("7"));
    assert_eq!(
        headers.get("accept").map(String::as_str),
        Some("text/event-stream")
    );
    assert_eq!(
        events.recv_timeout(WAIT).expect("an event"),
        json!({"type": "event", "event": "run", "data": "{}", "id": "1"})
    );

    deployment_stream_end(page(&app), 4);
    assert_eq!(fake.next(), Seen::HungUp("/events".to_owned()));
    assert_eq!(streams(&app), 0);
}

#[test]
fn deployment_call_commands_refuse_a_stream_that_opens_with_a_redirect() {
    let fake = FakeServer::serve();
    let app = shell();
    let prepared = ready(Ok(fake.get("/moved")));
    let (opened, _) = open(&app, &origin("halonic.example"), 1, None, prepared);
    let refused = as_json(&opened.expect_err("redirected"));
    assert_eq!(refused, json!({"code": "redirected"}));
    assert_eq!(streams(&app), 0);
}

#[test]
fn deployment_call_commands_end_the_streams_of_an_origin_signed_out_of() {
    let fake = FakeServer::serve();
    let app = shell();
    let signed_out = origin("halonic.example");
    let (first, _) = open(&app, &signed_out, 1, None, ready(Ok(fake.get("/a"))));
    let (second, _) = open(
        &app,
        &origin("other.example"),
        2,
        None,
        ready(Ok(fake.get("/b"))),
    );
    assert!(first.is_ok() && second.is_ok());
    for _ in 0..2 {
        assert!(matches!(fake.next(), Seen::Request { .. }));
    }

    end_origin(&app, &signed_out);
    assert_eq!(fake.next(), Seen::HungUp("/a".to_owned()));
    assert_eq!(streams(&app), 1);
}
