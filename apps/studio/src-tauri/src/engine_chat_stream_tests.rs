//! Requirement `engine-commands`: `engine_chat_stream` passes a chat turn's
//! lines to the page as the engine writes them, hangs up when the page
//! stops the turn, and calls no route but `POST /api/chat-turn` (HAL-17130).
//! The fake engine answers a turn that asks for lines by the `fake` field of
//! its body.

use std::io::{BufReader, Read, Write};
use std::net::TcpStream;
use std::sync::mpsc::{Receiver, Sender, channel};

use serde_json::{Value, json};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::test::MockRuntime;
use tauri::{App, Manager};

use super::super::chat_stream::engine_chat_stream;
use super::super::{EngineRefusal, EngineState, EngineStreamStart, engine_stream_end};
use super::{FakeEngine, LINES, Seen, TOKEN, WAIT, as_json, page, respond, shell};
use crate::engine_routes::ROUTES;

const CHAT_TURN: &str = "POST /api/chat-turn";

/// The lines of a short turn: two pieces of text, then the answer.
const TURN_LINES: &str =
    "{\"text\":\"Hel\"}\n{\"text\":\"lo\"}\n{\"response\":{\"message\":{\"content\":\"Hello\"}}}\n";

/// Answers a chat turn that asks for lines, by its body's `fake` field.
pub(super) fn answer_lines(
    connection: &mut TcpStream,
    reader: &mut BufReader<TcpStream>,
    body: &[u8],
    seen: &Sender<Seen>,
) {
    let body: Value = serde_json::from_slice(body).unwrap_or_default();
    match body["fake"].as_str().unwrap_or_default() {
        "lines" => open_lines(connection, TURN_LINES),
        // The model is still writing: one line, then nothing until the
        // shell hangs up.
        "hold" => {
            open_lines(connection, "{\"text\":\"Hel\"}\n");
            let mut rest = Vec::new();
            let _ = reader.read_to_end(&mut rest);
            let _ = seen.send(Seen::HungUp("/api/chat-turn".to_owned()));
        }
        "whole" => respond(connection, 200, r#"{"message":{"content":"Hello"}}"#),
        "refuse" => respond(connection, 400, r#"{"error":{"code":"bad_request"}}"#),
        "garbled" => open_lines(connection, "{\"text\":\"Hel\"}\nnot JSON\n"),
        // The connection ends in the middle of the answer's line.
        "cut" => open_lines(connection, "{\"text\":\"Hel\"}\n{\"respon"),
        _ => respond(connection, 404, "{}"),
    }
}

fn open_lines(connection: &mut TcpStream, lines: &str) {
    let _ = write!(
        connection,
        "HTTP/1.1 200 OK\r\nContent-Type: {LINES}; charset=utf-8\r\nConnection: close\r\n\r\n{lines}"
    );
    let _ = connection.flush();
}

/// Starts the page's chat turn `stream` with the fake's answer `fake`; the
/// channel's messages arrive on the receiver.
fn start_turn(
    app: &App<MockRuntime>,
    route: &str,
    stream: u64,
    fake: &str,
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
    let started = tauri::async_runtime::block_on(engine_chat_stream(
        page(app),
        route.to_owned(),
        stream,
        Some(json!({"messages": [], "fake": fake})),
        channel,
    ));
    (started, received)
}

fn messages(received: &Receiver<Value>, count: usize) -> Vec<Value> {
    (0..count)
        .map(|_| received.recv_timeout(WAIT).expect("a message"))
        .collect()
}

#[test]
fn engine_commands_stream_no_route_but_a_chat_turn() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let others = ROUTES
        .iter()
        .map(|route| route.name)
        .filter(|name| *name != CHAT_TURN);
    let near_misses = [
        "GET /api/chat-turn",
        "PUT /api/chat-turn",
        "post /api/chat-turn",
        "POST /api/chat-turn/",
        "POST /api/chat-turn?stream=1",
        "POST /api/chat-turn ",
        "POST  /api/chat-turn",
        "POST /api/Chat-Turn",
        "POST /api/chat-turn/../runs",
        "POST http://127.0.0.1/api/chat-turn",
        "POST /api/runs",
        "",
    ];
    for route in others.chain(near_misses) {
        let (started, _) = start_turn(&app, route, 1, "lines");
        let refusal = as_json(&started.expect_err(route));
        assert_eq!(refusal["kind"], "unknown_route", "{route:?}: {refusal}");
    }
    assert_eq!(app.state::<EngineState>().streams.count(), 0);

    // The first request the engine sees is the chat turn after the refusals.
    let (started, _) = start_turn(&app, CHAT_TURN, 1, "lines");
    assert!(started.is_ok());
    let Seen::Request {
        route,
        authorization,
        origin,
        body,
    } = fake.next()
    else {
        panic!("a request");
    };
    assert_eq!(route, CHAT_TURN);
    assert_eq!(authorization, format!("Bearer {TOKEN}"));
    assert_eq!(origin, None);
    let body: Value = serde_json::from_str(&body).expect("a JSON body");
    assert_eq!(body, json!({"messages": [], "fake": "lines"}));
}

#[test]
fn engine_commands_pass_on_a_chat_turns_lines_then_its_end() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let (started, received) = start_turn(&app, CHAT_TURN, 4, "lines");
    assert_eq!(as_json(&started.expect("opened")), json!({"stream": 4}));
    assert_eq!(
        messages(&received, 4),
        [
            json!({"type": "line", "line": {"text": "Hel"}}),
            json!({"type": "line", "line": {"text": "lo"}}),
            json!({"type": "line", "line": {"response": {"message": {"content": "Hello"}}}}),
            json!({"type": "end"}),
        ]
    );
}

#[test]
fn engine_commands_hang_up_on_a_chat_turn_the_page_stops() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let (started, received) = start_turn(&app, CHAT_TURN, 2, "hold");
    assert!(started.is_ok());
    // The first line comes while the engine is still writing.
    assert_eq!(
        messages(&received, 1),
        [json!({"type": "line", "line": {"text": "Hel"}})]
    );
    assert_eq!(fake.next_route(), CHAT_TURN);

    engine_stream_end(page(&app), 2);
    assert_eq!(fake.next(), Seen::HungUp("/api/chat-turn".to_owned()));
    assert_eq!(app.state::<EngineState>().streams.count(), 0);
}

#[test]
fn engine_commands_answer_a_chat_turn_the_engine_refuses_or_answers_whole() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let (refused, _) = start_turn(&app, CHAT_TURN, 1, "refuse");
    assert_eq!(
        as_json(&refused.expect("the engine's answer")),
        json!({"answer": {"status": 400, "body": {"error": {"code": "bad_request"}}}})
    );
    let (whole, _) = start_turn(&app, CHAT_TURN, 1, "whole");
    assert_eq!(
        as_json(&whole.expect("the engine's answer")),
        json!({"answer": {"status": 200, "body": {"message": {"content": "Hello"}}}})
    );
    assert_eq!(app.state::<EngineState>().streams.count(), 0);
}

#[test]
fn engine_commands_fail_a_chat_turn_line_that_isnt_json_and_drop_a_cut_off_line() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let (started, received) = start_turn(&app, CHAT_TURN, 1, "garbled");
    assert!(started.is_ok());
    let garbled = messages(&received, 2);
    assert_eq!(garbled[1]["type"], "failed", "{garbled:?}");

    let (started, received) = start_turn(&app, CHAT_TURN, 2, "cut");
    assert!(started.is_ok());
    assert_eq!(
        messages(&received, 2),
        [
            json!({"type": "line", "line": {"text": "Hel"}}),
            json!({"type": "end"}),
        ]
    );
}
