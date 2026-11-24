//! The shell's end of the background engine's control pipe (B1 step 5,
//! decision D2 of the HAL-14206 design note, with the HAL-14212 security
//! review's changes).
//!
//! The shell starts `halonic-agent-host --engine` and talks to it over the
//! engine's standard input and output, in frames: a `u32` big-endian length,
//! then that many bytes of UTF-8 JSON. The engine's side, and the source of
//! truth for the messages, is `apps/agent-host/src/engine/control-messages.ts`.
//!
//! The shell treats the engine as untrusted input:
//!
//! - [`read_frame`] checks a frame's length against
//!   [`MAX_ENGINE_FRAME_BYTES`] before it allocates for it.
//! - [`PipeSession::accept`] parses the closed set of the engine's messages
//!   strictly and keeps the order: the handshake first and once, request ids
//!   that only go up, `stopped` only after the shell's `stop`. It drops
//!   `health` frames beyond one a second.
//! - Anything else is a [`PipeFault`], which never holds the frame's content.
//!   On a fault the shell closes the engine's standard input, kills it and
//!   counts it as a crash.
//!
//! This crate holds no Tauri types and starts no process.

mod fault;
mod frame;
mod messages;
mod session;

pub use fault::PipeFault;
pub use frame::{
    FRAME_LENGTH_BYTES, MAX_ENGINE_FRAME_BYTES, MAX_SHELL_FRAME_BYTES, read_frame, write_frame,
};
pub use messages::{
    PROTOCOL_VERSION, SandboxHost, sandbox_host_json, secret_answer_json, stop_json,
};
pub use session::{EngineEvent, EngineHealth, HEALTH_EVERY, PipeSession};
