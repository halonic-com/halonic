//! How the shell reads a stream route's answer: one JSON line at a time, each
//! passed to the page's channel, then how the stream ended.

use halonic_agent_host::LineSplitter;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri_plugin_http::reqwest;

use super::{ANSWER_LIMIT, StreamMessage};

/// Sends each line until the stream ends, and answers how it ended.
pub(super) async fn read_lines(
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
