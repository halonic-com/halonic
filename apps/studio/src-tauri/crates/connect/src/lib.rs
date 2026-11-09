//! Checks the address the Android app connects to and reads the computer's
//! hello answer (flow-install-update 5.3 and 5.4).
//!
//! This crate holds no Tauri types: the shell's `connect` command is a thin
//! wrapper that runs [`check_address`], then makes the hello call to the
//! checked addresses. Errors come back as values; the connect page owns the
//! words (microcopy 20.4). Reading the hello answer arrives in the next pull
//! request of HAL-1140.

mod address;
mod check;
mod home_network;

pub use address::{Address, Host, NotAnAddress, Scheme, parse_address};
pub use check::{
    CheckedAddress, ConnectError, HELLO_TIMEOUT, Resolver, SystemResolver, check_address,
};
pub use home_network::{Reach, reach};
