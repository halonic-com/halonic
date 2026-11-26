//! The phone's tunnel service (tunnel D6, HAL-15157): what the shell's
//! phone tunnel commands call. It runs one pairing at a time with the
//! `halonic-tunnel` crate, keeps the computers the person allowed in the
//! `halonic-device-keys` list with the phone's key for each, and connects
//! to them.
//!
//! This crate holds no Tauri types. The keys stay inside it: the page gets
//! only the typed answers in [`answers`], the [`PageStatus`] the
//! [`TunnelHost`] passes on, and the text of the gateway messages it sends
//! and receives (D7a, HAL-15177), never a private key, a session key, the
//! pairing code or its psk.

mod answer_confirm;
pub mod answers;
mod connect;
mod connections;
mod host;
mod messages;
mod nearby;
mod pairing;
mod send;
mod service;
mod start;
mod status;
mod store;

#[cfg(test)]
mod answer_confirm_tests;
#[cfg(test)]
mod answers_tests;
#[cfg(test)]
mod connect_tests;
#[cfg(test)]
mod host_tests;
#[cfg(test)]
mod messages_tests;
#[cfg(test)]
mod nearby_tests;
#[cfg(test)]
mod start_tests;

pub use answer_confirm::ANSWER_WINDOW;
pub use answers::{
    ComputerView, ComputersAnswer, ConnectOutcome, ForgetOutcome, PairingOutcome, PairingStep,
    Problem, StandingView,
};
pub use host::{
    AwayAnswer, LocalNetwork, LocalNetworkAnswer, OwnerAnswer, PhoneAnswer, TunnelHost,
    confirm_with, needs_local_network, phone_name, times_away_with,
};
pub use messages::{GATEWAY_MAX_MESSAGE_BYTES, PHONE_MESSAGE_TYPES, SendAnswer, SendRefusal};
pub use nearby::{Hit, MAX_NEARBY, NearbyComputers, NearbyView};
pub use service::{Options, PhoneTunnel};
pub use start::{CheckedStart, PairingStart};
pub use status::{PageStatus, Reason};
