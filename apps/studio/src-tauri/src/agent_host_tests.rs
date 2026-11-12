//! Requirement `agent-host-commands`: the commands against a stand-in
//! host. A small script prints the handshake, as the host would, and names
//! a fake host served on loopback by the test itself, which records each
//! request and when the shell hangs up.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::test::{MockRuntime, mock_app};
use tauri::webview::WebviewWindowBuilder;
use tauri::{App, AppHandle, Manager, Webview, WebviewUrl};

use super::{
    AgentHostState, HostAnswer, HostRefusal, StreamStart, agent_host_request, agent_host_stream,
    agent_host_stream_end, end_page_streams, sweep_roots,
};

/// A made-up token of the right form, 43 base64url characters.
const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234";

/// Long enough for a script or a thread to start on a busy CI machine.
const WAIT: Duration = Duration::from_secs(20);

/// What the fake host saw.
#[derive(Debug, PartialEq, Eq)]
enum Seen {
    /// A request, as `"<METHOD> <path>"`, with its `Authorization` header
    /// and body.
    Request {
        route: String,
        authorization: String,
        body: String,
    },
    /// The shell hung up on the stream of this path.
    HungUp(String),
}

/// A fake agent host on loopback. Each route answers as the real one
/// might, or holds its answer until the test releases it.
struct FakeHost {
    port: u16,
    seen: Receiver<Seen>,
    release_bridge: Sender<()>,
}

impl FakeHost {
    fn serve() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback port");
        let port = listener.local_addr().expect("its address").port();
        let (seen_sender, seen) = channel();
        let (release_bridge, released) = channel();
        let released = Arc::new(Mutex::new(released));
        std::thread::spawn(move || {
            for connection in listener.incoming().flatten() {
                let seen = seen_sender.clone();
                let released = Arc::clone(&released);
                std::thread::spawn(move || answer(connection, &seen, &released));
            }
        });
        Self {
            port,
            seen,
            release_bridge,
        }
    }

    /// The next thing the host saw.
    fn next(&self) -> Seen {
        self.seen.recv_timeout(WAIT).expect("the fake host sees it")
    }
}

/// Reads one request and answers it by its path.
fn answer(connection: TcpStream, seen: &Sender<Seen>, released: &Mutex<Receiver<()>>) {
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
        body: String::from_utf8_lossy(&body).into_owned(),
    });
    let mut connection = connection;
    match path.as_str() {
        "/v1/health" => respond(&mut connection, 200, r#"{"ok":true,"version":"0.1.0"}"#),
        "/v1/harnesses" => respond(&mut connection, 200, "not JSON"),
        "/v1/sandbox/sessions/blocked" => respond(
            &mut connection,
            404,
            r#"{"error":{"kind":"unknown_session","message":"No such session."}}"#,
        ),
        "/v1/harnesses/runs/start" => stream_until_hung_up(&mut reader, connection, &path, seen),
        "/v1/bridge/open" => {
            // Held until the test lets it go, as a host slow to answer.
            let _ = released.lock().expect("one bridge at a time").recv();
            stream_until_hung_up(&mut reader, connection, &path, seen);
        }
        _ => respond(&mut connection, 404, r#"{"error":{"kind":"not_found"}}"#),
    }
}

fn respond(connection: &mut TcpStream, status: u16, body: &str) {
    let _ = write!(
        connection,
        "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

/// Starts an NDJSON stream with one line, then waits until the shell
/// hangs up, as a run or a bridge that stays quiet would.
fn stream_until_hung_up(
    reader: &mut BufReader<TcpStream>,
    mut connection: TcpStream,
    path: &str,
    seen: &Sender<Seen>,
) {
    let _ = write!(
        connection,
        "HTTP/1.1 200 OK\r\nContent-Type: application/x-ndjson\r\nConnection: close\r\n\r\n{{\"type\":\"started\"}}\n"
    );
    let _ = connection.flush();
    let mut rest = Vec::new();
    let _ = reader.read_to_end(&mut rest);
    let _ = seen.send(Seen::HungUp(path.to_owned()));
}

/// What a stand-in host does after it prints its handshake.
#[derive(Clone, Copy)]
enum AfterHandshake {
    /// Waits until its input closes, as the host does.
    WaitForInput,
    /// Exits at once, as a host that crashed.
    Exit,
}

static NEXT_SCRIPT: AtomicU32 = AtomicU32::new(0);

/// A command that starts a stand-in host for the fake host on `port`.
fn stand_in(port: u16, after: AfterHandshake) -> Command {
    let line = format!(r#"{{"url":"http://127.0.0.1:{port}","token":"{TOKEN}"}}"#);
    let number = NEXT_SCRIPT.fetch_add(1, Ordering::Relaxed);
    let name = format!(
        "halonic-agent-host-commands-{}-{number}",
        std::process::id()
    );
    write_script(std::env::temp_dir().join(name), &line, after)
}

/// Runs through `sh` rather than as a program of its own: executing a file
/// just written can fail with "text file busy" while another test thread
/// starts a process.
#[cfg(unix)]
fn write_script(base: PathBuf, line: &str, after: AfterHandshake) -> Command {
    let then = match after {
        AfterHandshake::WaitForInput => "cat > /dev/null",
        AfterHandshake::Exit => "exit 0",
    };
    let path = base.with_extension("sh");
    std::fs::write(&path, format!("printf '%s\\n' '{line}'\n{then}\n")).expect("write the script");
    let mut command = Command::new("/bin/sh");
    command.arg(path);
    command
}

#[cfg(windows)]
fn write_script(base: PathBuf, line: &str, after: AfterHandshake) -> Command {
    // `findstr` reads its input until it closes.
    let then = match after {
        AfterHandshake::WaitForInput => "findstr \"^\" >nul",
        AfterHandshake::Exit => "exit /b 0",
    };
    let path = base.with_extension("cmd");
    std::fs::write(&path, format!("@echo off\r\necho {line}\r\n{then}\r\n"))
        .expect("write the script");
    Command::new(path)
}

/// A shell on the mock runtime whose host is a stand-in for `fake`, with
/// its main window, and how many hosts it has started.
struct Shell {
    app: App<MockRuntime>,
    starts: Arc<AtomicUsize>,
}

impl Shell {
    fn new(fake: &FakeHost, after: AfterHandshake) -> Self {
        let starts = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&starts);
        let port = fake.port;
        let app = mock_app();
        app.manage(AgentHostState::with_command(move || {
            counted.fetch_add(1, Ordering::SeqCst);
            stand_in(port, after)
        }));
        WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
            .build()
            .expect("the main window opens");
        Self { app, starts }
    }

    fn handle(&self) -> AppHandle<MockRuntime> {
        self.app.handle().clone()
    }

    fn starts(&self) -> usize {
        self.starts.load(Ordering::SeqCst)
    }
}

fn page(app: &AppHandle<MockRuntime>) -> Webview<MockRuntime> {
    let window = app.get_webview_window("main").expect("the main window");
    window.as_ref().clone()
}

fn request(
    app: &AppHandle<MockRuntime>,
    route: &str,
    body: Option<Value>,
) -> Result<HostAnswer, HostRefusal> {
    tauri::async_runtime::block_on(agent_host_request(app.clone(), route.to_owned(), body))
}

/// Opens the page's stream `stream`; its messages arrive on the receiver.
fn open_stream(
    app: &AppHandle<MockRuntime>,
    route: &str,
    stream: u64,
) -> (Result<StreamStart, HostRefusal>, Receiver<Value>) {
    let (messages, received) = channel();
    let channel = Channel::new(move |body| {
        let message = match body {
            InvokeResponseBody::Json(text) => serde_json::from_str(&text),
            InvokeResponseBody::Raw(bytes) => serde_json::from_slice(&bytes),
        };
        let _ = messages.send(message.expect("a JSON message"));
        Ok(())
    });
    let opened = tauri::async_runtime::block_on(agent_host_stream(
        page(app),
        route.to_owned(),
        stream,
        Some(json!({})),
        channel,
    ));
    (opened, received)
}

fn as_json(value: &impl serde::Serialize) -> String {
    serde_json::to_string(value).expect("serializes")
}

#[test]
fn agent_host_commands_call_the_host_with_the_token_and_never_show_it() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);

    let answer = request(&shell.handle(), "GET /v1/health", None).expect("the host answers");
    assert_eq!(
        as_json(&answer),
        r#"{"status":200,"body":{"ok":true,"version":"0.1.0"}}"#
    );
    assert_eq!(
        fake.next(),
        Seen::Request {
            route: "GET /v1/health".to_owned(),
            authorization: format!("Bearer {TOKEN}"),
            body: String::new(),
        }
    );

    let refusal = request(&shell.handle(), "GET /v1/harnesses", None)
        .expect_err("an answer that isn't JSON is refused");
    let refusal = as_json(&refusal);
    assert!(refusal.contains(r#""kind":"io""#), "{refusal}");
    assert!(!refusal.contains(TOKEN));
}

#[test]
fn agent_host_commands_send_an_empty_object_for_a_post_without_a_body() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);

    for body in [None, Some(Value::Null)] {
        let _ = request(&shell.handle(), "POST /v1/sandbox/sessions/close", body);
        let Seen::Request { body, .. } = fake.next() else {
            panic!("a request");
        };
        assert_eq!(body, "{}");
    }
    let refusal = request(
        &shell.handle(),
        "GET /v1/health",
        Some(json!({"extra": true})),
    )
    .expect_err("a GET takes no body");
    assert!(as_json(&refusal).contains(r#""kind":"io""#));
}

#[test]
fn agent_host_commands_start_one_host_for_calls_at_the_same_time() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    let calls: Vec<_> = (0..2)
        .map(|_| {
            let app = shell.handle();
            std::thread::spawn(move || request(&app, "GET /v1/health", None).is_ok())
        })
        .collect();
    for call in calls {
        assert!(call.join().expect("the call ends"));
    }
    assert_eq!(shell.starts(), 1);
}

#[test]
fn agent_host_commands_start_a_new_host_when_the_last_has_exited() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::Exit);
    let deadline = Instant::now() + WAIT;
    while shell.starts() < 2 {
        assert!(Instant::now() < deadline, "no second host was started");
        // The stand-in serves its handshake, then exits; the fake answers.
        let _ = request(&shell.handle(), "GET /v1/health", None);
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[test]
fn agent_host_commands_refuse_an_unknown_route_before_starting_a_host() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    let refusal =
        request(&shell.handle(), "GET http://example.com/", None).expect_err("not a route");
    assert!(as_json(&refusal).contains(r#""kind":"unknown_route""#));
    let (opened, _) = open_stream(&shell.handle(), "GET /v1/health", 1);
    assert!(as_json(&opened.expect_err("not a stream route")).contains("unknown_route"));
    assert_eq!(shell.starts(), 0);
}

#[test]
fn agent_host_commands_answer_a_refused_stream_and_pass_on_an_opened_one() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);

    let (refused, _) = open_stream(&shell.handle(), "POST /v1/sandbox/sessions/blocked", 1);
    let refused = as_json(&refused.expect("the host's answer"));
    assert!(refused.contains(r#""status":404"#), "{refused}");
    assert!(refused.contains("unknown_session"), "{refused}");

    // A refused stream's id is free again.
    let (opened, lines) = open_stream(&shell.handle(), "POST /v1/harnesses/runs/start", 1);
    assert_eq!(as_json(&opened.expect("opened")), r#"{"stream":1}"#);
    assert_eq!(
        lines.recv_timeout(WAIT).expect("a line"),
        json!({"type": "line", "line": {"type": "started"}})
    );
}

#[test]
fn agent_host_commands_refuse_a_stream_id_the_page_already_uses() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    let (first, _lines) = open_stream(&shell.handle(), "POST /v1/harnesses/runs/start", 4);
    assert!(first.is_ok());
    let (second, _) = open_stream(&shell.handle(), "POST /v1/harnesses/runs/start", 4);
    assert!(as_json(&second.expect_err("in use")).contains("stream_in_use"));
}

#[test]
fn agent_host_commands_hang_up_when_the_page_ends_a_stream() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    let (opened, lines) = open_stream(&shell.handle(), "POST /v1/harnesses/runs/start", 2);
    assert!(opened.is_ok());
    lines.recv_timeout(WAIT).expect("the first line");
    let _ = fake.next();

    agent_host_stream_end(page(&shell.handle()), 2);
    assert_eq!(
        fake.next(),
        Seen::HungUp("/v1/harnesses/runs/start".to_owned())
    );
}

#[test]
fn agent_host_commands_hang_up_on_the_streams_of_a_page_that_reloads() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    let (opened, lines) = open_stream(&shell.handle(), "POST /v1/harnesses/runs/start", 3);
    assert!(opened.is_ok());
    lines.recv_timeout(WAIT).expect("the first line");
    let _ = fake.next();

    // What the shell does when the page starts loading, or its window closes.
    end_page_streams(shell.app.handle(), "main");
    assert_eq!(
        fake.next(),
        Seen::HungUp("/v1/harnesses/runs/start".to_owned())
    );
}

#[test]
fn agent_host_commands_hang_up_on_a_stream_the_page_ended_before_the_host_answered() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    let opening = {
        let app = shell.handle();
        std::thread::spawn(move || as_json(&open_stream(&app, "POST /v1/bridge/open", 5).0))
    };
    // The host has the request, and holds its answer.
    let _ = fake.next();
    agent_host_stream_end(page(&shell.handle()), 5);
    fake.release_bridge.send(()).expect("the fake waits");

    let opened = opening.join().expect("the call ends");
    assert!(opened.contains("stream_ended"), "{opened}");
    assert_eq!(fake.next(), Seen::HungUp("/v1/bridge/open".to_owned()));
}

#[test]
fn agent_host_commands_take_the_end_of_a_stream_that_isnt_open() {
    // An id that has already ended, or never opened, is fine.
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    agent_host_stream_end(page(&shell.handle()), 99);
    let state = shell.app.state::<AgentHostState>();
    assert!(state.streams.lock().expect("the streams").is_empty());
}

#[test]
fn agent_host_commands_sweep_the_profile_and_the_opened_folders() {
    let profile = std::env::temp_dir().join("profile");
    let acme = std::env::temp_dir().join("acme");
    assert_eq!(sweep_roots(&profile, &[]), std::slice::from_ref(&profile));
    assert_eq!(
        sweep_roots(&profile, std::slice::from_ref(&acme)),
        [profile, acme]
    );
}

#[cfg(windows)]
#[test]
fn agent_host_commands_sweep_opened_folders_without_the_long_path_prefix() {
    let profile = PathBuf::from(r"C:\acme-profile"); // leak-guard: allow absolute-path made-up Windows path for a test
    let opened = PathBuf::from(r"\\?\D:\acme"); // leak-guard: allow absolute-path made-up Windows path for a test
    assert_eq!(
        sweep_roots(&profile, &[opened]),
        [profile, PathBuf::from(r"D:\acme")] // leak-guard: allow absolute-path made-up Windows path for a test
    );
}
