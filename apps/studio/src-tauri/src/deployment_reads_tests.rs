//! Requirement `deployment-call-commands`: the limits on what the shell
//! reads from an owner server, the size of an answer and of an event, and
//! how long a stream may stay quiet.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{Value, json};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri_plugin_http::reqwest;

use super::{ANSWER_LIMIT, FRAME_LIMIT, IDLE_TIMEOUT, read_answer, read_events};
use crate::engine::EngineStreamMessage;

/// A whole answer with `status` and `body`, as the server would send it.
fn response(status: u16, body: String) -> reqwest::Response {
    let response = tauri::http::Response::builder()
        .status(status)
        .body(body)
        .expect("a response");
    reqwest::Response::from(response)
}

/// A JSON string of exactly `size` bytes.
fn json_of_size(size: usize) -> String {
    format!("\"{}\"", "x".repeat(size - 2))
}

/// A channel that keeps what the shell sends on it.
fn kept_channel() -> (Channel<EngineStreamMessage>, Arc<Mutex<Vec<Value>>>) {
    let kept = Arc::new(Mutex::new(Vec::new()));
    let keeper = Arc::clone(&kept);
    let channel = Channel::new(move |body| {
        let message = match body {
            InvokeResponseBody::Json(text) => serde_json::from_str(&text),
            InvokeResponseBody::Raw(bytes) => serde_json::from_slice(&bytes),
        };
        keeper
            .lock()
            .expect("the list")
            .push(message.expect("a JSON message"));
        Ok(())
    });
    (channel, kept)
}

fn as_json(value: &impl serde::Serialize) -> Value {
    serde_json::to_value(value).expect("serializes")
}

/// Reads `response`'s events, with `idle` as the quiet limit.
fn events_of(mut response: reqwest::Response, idle: Duration) -> (EngineStreamMessage, Vec<Value>) {
    let (channel, kept) = kept_channel();
    let ending = tauri::async_runtime::block_on(read_events(&mut response, &channel, idle));
    let sent = kept.lock().expect("the list").clone();
    (ending, sent)
}

#[test]
fn deployment_call_commands_read_an_answer_up_to_4_mib() {
    assert_eq!(ANSWER_LIMIT, 4 * 1024 * 1024);
    let whole =
        tauri::async_runtime::block_on(read_answer(response(200, json_of_size(ANSWER_LIMIT))));
    let whole = whole.expect("read");
    assert_eq!(whole.status, 200);

    let over =
        tauri::async_runtime::block_on(read_answer(response(200, json_of_size(ANSWER_LIMIT + 1))));
    assert_eq!(
        as_json(&over.expect_err("too large")),
        json!({"code": "unreadable"})
    );
}

#[test]
fn deployment_call_commands_refuse_a_redirect_without_reading_it() {
    let answer = tauri::async_runtime::block_on(read_answer(response(302, String::new())));
    assert_eq!(
        as_json(&answer.expect_err("redirected")),
        json!({"code": "redirected"})
    );
}

#[test]
fn deployment_call_commands_pass_on_events_up_to_1_mib() {
    assert_eq!(FRAME_LIMIT, 1024 * 1024);
    let within = format!("data: {}\n\n", "x".repeat(FRAME_LIMIT - 64));
    let (ending, sent) = events_of(response(200, within), IDLE_TIMEOUT);
    assert_eq!(as_json(&ending), json!({"type": "end"}));
    assert_eq!(sent.len(), 1);

    let over = format!("data: {}\n\n", "x".repeat(FRAME_LIMIT));
    let (ending, sent) = events_of(response(200, over), IDLE_TIMEOUT);
    assert_eq!(
        as_json(&ending),
        json!({"type": "failed", "message": "the server sent an event larger than the shell reads"})
    );
    assert!(sent.is_empty());
}

#[test]
fn deployment_call_commands_end_a_stream_that_stays_quiet() {
    assert_eq!(IDLE_TIMEOUT, Duration::from_secs(120));
    // A server that opens the stream, then sends nothing until the shell
    // hangs up. A quiet limit of zero ends it at the first wait, with no
    // real wait in the test.
    let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback port");
    let port = listener.local_addr().expect("its address").port();
    std::thread::spawn(move || {
        if let Ok((mut connection, _)) = listener.accept() {
            let mut request = [0; 1024];
            let _ = connection.read(&mut request);
            let _ = write!(
                connection,
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n"
            );
            let _ = connection.flush();
            let mut rest = Vec::new();
            let _ = connection.read_to_end(&mut rest);
        }
    });
    let opened = tauri::async_runtime::block_on(
        reqwest::Client::builder()
            .no_proxy()
            .build()
            .expect("a client")
            .get(format!("http://127.0.0.1:{port}/events"))
            .send(),
    );
    let (ending, sent) = events_of(opened.expect("opened"), Duration::ZERO);
    assert_eq!(
        as_json(&ending),
        json!({"type": "failed", "message": "the server sent nothing for 2 minutes"})
    );
    assert!(sent.is_empty());
}
