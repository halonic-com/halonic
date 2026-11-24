//! The frames on the pipe, as `apps/agent-host/src/engine/control-messages.ts`
//! defines them. A change there changes these too.

use halonic_secret_broker::BrokerAnswer;
use serde::{Deserialize, Serialize};

use crate::fault::PipeFault;

/// The protocol version both ends speak. A handshake with any other ends
/// the engine.
pub const PROTOCOL_VERSION: u32 = 1;

/// Every frame the engine may send, parsed strictly: an unknown kind, a
/// missing field or an extra one is [`PipeFault::NotAMessage`].
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum EngineFrame {
    Handshake {
        protocol: u32,
        url: String,
        token: String,
    },
    SecretGet {
        id: u64,
        name: String,
    },
    TokenGet {
        id: u64,
        name: String,
    },
    OriginsGet {
        id: u64,
        name: String,
    },
    #[serde(rename_all = "camelCase")]
    Health {
        scheduling: bool,
        active_runs: u32,
        // Required though nullable: serde would take a missing `Option` as
        // `None`, and a missing field is a fault.
        #[serde(deserialize_with = "Option::deserialize")]
        last_tick: Option<String>,
    },
    Stopped {
        interrupted: u32,
    },
}

/// Parses one frame's JSON bytes. Bad UTF-8 is bad JSON to `serde_json`.
/// Only an object is a frame: serde would also take an internally tagged
/// enum written as an array, such as `["secret_get",5,"acme"]`. The check
/// looks at the first byte rather than going through `serde_json::Value`,
/// which would keep the last of two repeated keys instead of refusing them.
pub(crate) fn parse_frame(json: &[u8]) -> Result<EngineFrame, PipeFault> {
    let first = json
        .iter()
        .copied()
        .find(|&byte| !matches!(byte, b' ' | b'\t' | b'\n' | b'\r'));
    if first != Some(b'{') {
        return Err(PipeFault::NotAMessage);
    }
    serde_json::from_slice(json).map_err(|_| PipeFault::NotAMessage)
}

/// Where the sandbox host is: its loopback address and launch token. The
/// token goes nowhere but the engine's pipe.
#[derive(Clone, Copy)]
pub struct SandboxHost<'a> {
    pub url: &'a str,
    pub token: &'a str,
}

#[derive(Serialize)]
struct Connection<'a> {
    url: &'a str,
    token: &'a str,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum ShellFrame<'a> {
    SandboxHost { connection: Option<Connection<'a>> },
    Stop,
}

/// `secret_answer`: a plain struct, so the broker's answer flattens in
/// beside the request's id.
#[derive(Serialize)]
struct SecretAnswerFrame<'a> {
    kind: &'static str,
    id: u64,
    #[serde(flatten)]
    answer: &'a BrokerAnswer,
}

/// The `sandbox_host` frame's JSON: where the sandbox host is, or `null`
/// while none runs.
pub fn sandbox_host_json(host: Option<SandboxHost<'_>>) -> Vec<u8> {
    to_json(&ShellFrame::SandboxHost {
        connection: host.map(|host| Connection {
            url: host.url,
            token: host.token,
        }),
    })
}

/// The `stop` frame's JSON.
pub fn stop_json() -> Vec<u8> {
    to_json(&ShellFrame::Stop)
}

/// The `secret_answer` frame's JSON: the broker's answer to request `id`.
pub fn secret_answer_json(id: u64, answer: &BrokerAnswer) -> Vec<u8> {
    to_json(&SecretAnswerFrame {
        kind: "secret_answer",
        id,
        answer,
    })
}

fn to_json(frame: &impl Serialize) -> Vec<u8> {
    // Plain strings, numbers and options: serializing can't fail.
    serde_json::to_vec(frame).unwrap_or_default()
}
