//! Requirement `engine-commands`: every wait on the engine ends (failure-path
//! rule 1), and a broken lock is reported, never skipped (HAL-16775). The
//! silent engine accepts each request and never finishes its answer.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::{Sender, channel};
use std::time::Duration;

use halonic_agent_host::read_handshake;
use serde_json::json;
use tauri::Manager;

use super::super::EngineState;
use super::{FakeEngine, Seen, TOKEN, as_json, open_stream, shell_with};

/// Short, so the test doesn't wait the real 120 s. The silent engine never
/// answers, so the limit always passes, however busy the machine is.
const SHORT_LIMIT: Duration = Duration::from_millis(200);

impl FakeEngine {
    /// An engine that reads each request and never ends its answer: it sends
    /// nothing, or for `refused` only a 404's head, then waits until the shell
    /// hangs up.
    fn silent() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback port");
        let port = listener.local_addr().expect("its address").port();
        let (seen_sender, seen) = channel();
        std::thread::spawn(move || {
            for connection in listener.incoming().flatten() {
                let seen = seen_sender.clone();
                std::thread::spawn(move || hold(connection, &seen));
            }
        });
        Self { port, seen }
    }
}

fn hold(mut connection: TcpStream, seen: &Sender<Seen>) {
    let mut reader = BufReader::new(connection.try_clone().expect("a second handle"));
    let mut request_line = String::new();
    let _ = reader.read_line(&mut request_line);
    let path = request_line
        .split_whitespace()
        .nth(1)
        .unwrap_or_default()
        .to_owned();
    if path.starts_with("/api/runs/refused/") {
        let _ = write!(
            connection,
            "HTTP/1.1 404 X\r\nContent-Type: application/json\r\nContent-Length: 64\r\n\r\n"
        );
        let _ = connection.flush();
    }
    let mut rest = Vec::new();
    let _ = reader.read_to_end(&mut rest);
    let _ = seen.send(Seen::HungUp(path));
}

#[test]
fn engine_commands_refuse_a_stream_the_engine_never_opens() {
    let fake = FakeEngine::silent();
    let app = shell_with(&fake, EngineState::with_stream_opening_limit(SHORT_LIMIT));
    let cases = [
        ("GET /api/run-updates", json!({})),
        (
            "GET /api/runs/{run}/events",
            json!({"run": "refused", "after": 0}),
        ),
    ];
    for (stream, (route, params)) in (1_u64..).zip(cases) {
        let (opened, _) = open_stream(&app, route, stream, params);
        let refusal = as_json(&opened.expect_err("the engine never answers"));
        assert_eq!(refusal["kind"], "engine_unavailable", "{route}: {refusal}");
        assert!(matches!(fake.next(), Seen::HungUp(_)), "{route}");
        assert_eq!(app.state::<EngineState>().streams.count(), 0);
    }
}

#[test]
fn engine_commands_give_a_streams_opening_answer_120_seconds() {
    assert_eq!(
        EngineState::default().stream_opening_limit,
        Duration::from_secs(120)
    );
}

#[test]
fn engine_commands_report_a_broken_lock_when_connecting_or_disconnecting() {
    let state = EngineState::default();
    std::thread::scope(|scope| {
        let poisoner = scope.spawn(|| {
            let _held = state.connections.lock();
            panic!("a failure while the lock is held");
        });
        assert!(poisoner.join().is_err());
    });
    let line = format!(r#"{{"url":"http://127.0.0.1:1","token":"{TOKEN}"}}"#);
    let handshake = read_handshake(&line).expect("a valid handshake");
    let connected = state.connect("main", handshake);
    assert_eq!(as_json(&connected.expect_err("broken"))["kind"], "io");
    let disconnected = state.disconnect("main");
    assert_eq!(as_json(&disconnected.expect_err("broken"))["kind"], "io");
}
