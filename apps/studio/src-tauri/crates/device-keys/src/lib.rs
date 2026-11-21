//! The phone's own key for each paired computer (HAL-12245, build plan
//! decision 10 on HAL-12232, ADR "Pairing and the end-to-end session").
//!
//! The phone has one static X25519 key pair per paired computer, made in
//! Rust by the phone transport (`snow`). Neither the Android Keystore nor
//! the iOS Secure Enclave can do the X25519 operations Noise needs, so the
//! key isn't kept in them: it is kept in a file, encrypted by a key that
//! never leaves them.
//!
//! - [`DeviceKeyStore`]: the port. Load, save and forget the key of one
//!   computer.
//! - [`KeyWrapper`]: the platform half. It seals and opens a key with a key
//!   held by the platform's key store, bound to the computer it belongs to.
//!   The shell's Android adapter uses an Android Keystore AES-GCM key;
//!   iOS will use a Secure Enclave key the same way.
//! - [`WrappedFileStore`]: the [`DeviceKeyStore`] the phone uses, one sealed
//!   file per computer.
//! - [`PairedComputers`]: the computers the phone has paired with, each
//!   one's [`ComputerDetails`] and [`Standing`] next to its key. Removed
//!   wipes the key and keeps the entry; Forget deletes both.
//! - [`check_store_contract`] and [`check_wrapper_contract`]: the behaviour
//!   every store and every wrapper must show. [`FakeWrapper`] is for tests.
//!
//! This crate holds no Tauri types and no crypto of its own.

mod computer;
mod contract;
mod details;
mod error;
mod fake;
mod file_store;
mod files;
mod key;
mod paired;
mod store;
mod wrapper;

#[cfg(test)]
mod computer_tests;
#[cfg(test)]
mod file_store_tests;
#[cfg(test)]
mod key_tests;
#[cfg(test)]
mod paired_tests;

pub use computer::{ComputerId, MAX_COMPUTER_ID_LENGTH};
pub use contract::{check_store_contract, check_wrapper_contract};
pub use details::{ComputerDetails, MAX_ENDPOINTS, Standing};
pub use error::DeviceKeyError;
pub use fake::FakeWrapper;
pub use file_store::WrappedFileStore;
pub use key::{DeviceKeyPair, KEY_BYTES, PrivateKey};
pub use paired::{NewPairing, PairedComputer, PairedComputers};
pub use store::DeviceKeyStore;
pub use wrapper::KeyWrapper;
