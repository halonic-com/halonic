//! Running the background engine from the shell (B1 step 5, decisions D2
//! and D7 of the HAL-14206 design note, with the HAL-14212 security
//! review's changes).
//!
//! - [`EngineProcess::start`] runs `halonic-agent-host --engine` (the
//!   command from `halonic_agent_host::engine_command`), sends its stderr to
//!   the shell's log, and waits for its handshake.
//! - [`EngineLink`] reads the engine's control pipe on a thread of its own
//!   (`halonic-engine-pipe` checks every frame) and answers secret requests
//!   from the [`halonic_secret_broker::SecretBroker`] on another, in a queue
//!   of at most 16; one beyond that is answered `busy`.
//! - Any fault on the pipe closes the engine's input and kills it; the
//!   watcher hears how the link ended and counts it as a crash.
//! - [`EngineProcess::stop`] is Quit: `stop`, then a kill after
//!   [`STOP_KILL_AFTER`] if the engine hasn't exited.
//! - [`RestartLimit`]: a crashed engine starts again at most 3 times in 5
//!   minutes; after that it is in the problem state.
//!
//! No Tauri types: the shell's wiring (one engine per workspace, the
//! window's engine commands, the tray) uses these.

mod link;
mod process;
mod restart;

pub use link::{EngineLink, LinkEnd, LinkWatcher, OpenError};
pub use process::{EngineChild, EngineProcess, START_WAIT, STOP_KILL_AFTER, StartError, Stopped};
pub use restart::{RESTART_WINDOW, RESTARTS, RestartLimit};
