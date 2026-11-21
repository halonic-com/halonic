//! The phone's tunnel service (tunnel D6, HAL-15157): what the shell's
//! phone tunnel commands call. It runs one pairing at a time with the
//! `halonic-tunnel` crate, keeps the computers the person allowed in the
//! `halonic-device-keys` list with the phone's key for each, and connects
//! to them.
//!
//! This crate holds no Tauri types. The keys stay inside it: the page gets
//! only the typed answers in [`answers`] and the [`PageStatus`] the
//! [`TunnelHost`] passes on, never a private key, a session key, the
//! pairing code or its psk.

pub mod answers;
mod connect;
mod connections;
mod host;
mod pairing;
mod service;
mod start;
mod status;
mod store;

#[cfg(test)]
mod answers_tests;
#[cfg(test)]
mod host_tests;
#[cfg(test)]
mod start_tests;

pub use answers::{
    ComputerView, ComputersAnswer, ConnectOutcome, ForgetOutcome, PairingOutcome, PairingStep,
    Problem, StandingView,
};
pub use host::{
    LocalNetwork, LocalNetworkAnswer, PhoneAnswer, TunnelHost, needs_local_network, phone_name,
};
pub use service::{Options, PhoneTunnel};
pub use start::{CheckedStart, PairingStart};
pub use status::{PageStatus, Reason};
