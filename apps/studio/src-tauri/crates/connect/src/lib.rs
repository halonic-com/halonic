//! Checks the address the Android app connects to and reads the computer's
//! hello answer (flow-install-update 5.3 and 5.4).
//!
//! This crate holds no Tauri types: the shell's `connect` command is a thin
//! wrapper that runs [`check_address`] with a [`TimedResolver`], makes the
//! hello call to the checked addresses, and turns the reply into a
//! [`ConnectResult`] for the page. Errors and states come back as values;
//! the connect page owns the words (microcopy 20.4). The pairing scanner's
//! `pair_scan` command reads its answers the same way, with [`read_scanned`].

mod address;
mod check;
mod connect_result;
#[cfg(test)]
mod fixtures;
mod hello;
mod home_network;
mod local_network;
mod navigation;
mod pair_scan;
mod timed_resolver;
mod version;

pub use address::{Address, Host, NotAnAddress, Scheme, parse_address};
pub use check::{
    CheckedAddress, ConnectError, HELLO_TIMEOUT, Resolver, SystemResolver, check_address,
};
pub use connect_result::{ConnectResult, HelloBody, HelloReply, MAX_HELLO_BYTES};
pub use hello::{AppVersions, Hello, HelloOutcome, NotHalonic, compare_versions, read_hello};
pub use home_network::{Reach, reach};
pub use local_network::{call_needs_local_network, lookup_needs_local_network};
pub use navigation::{Destination, NavigationTarget, navigation_destination, page_may_stay};
pub use pair_scan::{CameraPermission, QR_CODE_FORMAT, ScanAnswer, read_scanned};
pub use timed_resolver::TimedResolver;
pub use version::Version;
