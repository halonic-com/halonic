//! The shell's answers to the background engine's secret requests (B1 step
//! 2, decision D4 of the HAL-14206 design note, with the changes from the
//! HAL-14212 security review).
//!
//! The engine runs in its own process and can't read the desktop keychain.
//! It asks the shell over its control pipe, and [`SecretBroker`] answers:
//!
//! - [`BrokerRequest::Secret`]: a workspace secret. Refused by rule, not by
//!   a list of names ([`engine_secret_name`]): Halonic's own names
//!   (`token_key`, `serve_password`, every token) and every plugin secret.
//! - [`BrokerRequest::Token`]: a connector's token, through `get_token`.
//! - [`BrokerRequest::Origins`]: a key's allowed origins, read only.
//!
//! It answers only while the engine's workspace has a trust record
//! ([`WorkspaceTrust`]), makes one keychain call at a time, answers
//! `unavailable` when a call takes longer than [`KEYCHAIN_TIMEOUT`], and
//! refuses more than [`MAX_OUTSTANDING`] requests at once. Nothing here
//! logs, stores or keeps a value.
//!
//! This crate holds no Tauri types. The shell's control-pipe reader parses
//! the engine's frames, calls [`SecretBroker::answer`] off the UI thread and
//! writes the [`BrokerAnswer`] back.

mod broker;
mod call;
mod rule;
mod trust;

pub use broker::{
    BrokerAnswer, BrokerRefusal, BrokerRequest, KEYCHAIN_TIMEOUT, MAX_OUTSTANDING, SecretBroker,
};
pub use rule::{PLUGIN_PREFIX, engine_secret_name};
pub use trust::{TrustRecord, WorkspaceTrust};
