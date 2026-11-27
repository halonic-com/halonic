//! Reading an owner server's answers for `deployment_calls`: a whole JSON
//! answer, or a stream's events, each with a size limit, and a stream with a
//! limit on how long it may stay quiet.

use std::time::Duration;

use halonic_owner_sign_in::not_redirected;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri_plugin_http::reqwest;

use crate::deployment_calls::{DeploymentAnswer, DeploymentRefusal};
use crate::engine::EngineStreamMessage;
use crate::engine_sse::{SseFault, SseReader};

/// How long an open stream may send nothing. The server sends no keep-alive,
/// so a quiet run ends its stream here, and the page resumes it from the
/// last event it has.
pub(crate) const IDLE_TIMEOUT: Duration = Duration::from_secs(120);

/// The largest JSON answer the shell reads: a run summary or the waiting
/// list of at most 100 runs.
const ANSWER_LIMIT: usize = 4 * 1024 * 1024;

/// The largest event the shell reads from a stream.
const FRAME_LIMIT: usize = 1024 * 1024;

/// Reads a whole JSON answer, up to [`ANSWER_LIMIT`]. A redirect is refused;
/// an answer that is larger, breaks off or isn't JSON is `unreadable`.
pub(crate) async fn read_answer(
    mut response: reqwest::Response,
) -> Result<DeploymentAnswer, DeploymentRefusal> {
    let status = not_redirected(response.status().as_u16())?;
    let mut bytes = Vec::new();
    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(_) => return Err(DeploymentRefusal::new("unreadable")),
        };
        if bytes.len() + chunk.len() > ANSWER_LIMIT {
            return Err(DeploymentRefusal::new("unreadable"));
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Ok(DeploymentAnswer {
            status,
            body: Value::Null,
        });
    }
    let body = serde_json::from_slice(&bytes).map_err(|_| DeploymentRefusal::new("unreadable"))?;
    Ok(DeploymentAnswer { status, body })
}

/// Sends each event until the stream ends, or sends nothing for `idle`
/// ([`IDLE_TIMEOUT`] outside tests), and answers how it ended.
pub(crate) async fn read_events(
    response: &mut reqwest::Response,
    channel: &Channel<EngineStreamMessage>,
    idle: Duration,
) -> EngineStreamMessage {
    let mut reader = SseReader::new(FRAME_LIMIT);
    loop {
        let chunk = match tokio::time::timeout(idle, response.chunk()).await {
            Ok(Ok(Some(chunk))) => chunk,
            Ok(Ok(None)) => return EngineStreamMessage::End,
            Ok(Err(_)) => return stream_failed("the server's stream broke off"),
            Err(_) => return stream_failed("the server sent nothing for 2 minutes"),
        };
        let frames = match reader.push(&chunk) {
            Ok(frames) => frames,
            Err(SseFault::TooLarge) => {
                return stream_failed("the server sent an event larger than the shell reads");
            }
            Err(SseFault::NotText) => {
                return stream_failed("the server sent an event that isn't text");
            }
        };
        for frame in frames {
            let message = EngineStreamMessage::Event {
                event: frame.event,
                data: frame.data,
                id: frame.id,
            };
            if channel.send(message).is_err() {
                return stream_failed("the page stopped listening");
            }
        }
    }
}

fn stream_failed(message: &str) -> EngineStreamMessage {
    EngineStreamMessage::Failed {
        message: message.to_owned(),
    }
}

#[cfg(test)]
#[path = "deployment_reads_tests.rs"]
mod tests;
