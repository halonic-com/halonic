//! The keychain rules the Studio shell shares across platforms (HAL-192,
//! interface agreed with Priya on HAL-229).
//!
//! - [`SecretName`]: the `Secrets` port's name rule and canonical form, the
//!   same as the CLI's (requirement `secret-names`).
//! - [`SecretBackend`]: where secrets are kept, with [`get_secret`],
//!   [`set_secret`] and [`delete_secret`] checking names and values first
//!   (requirement `secret-commands`).
//! - [`check_backend_contract`]: the behaviour every backend must show.
//!
//! This crate holds no Tauri types and no keychain crate: the shell's
//! `secret_*` commands and its desktop and Android backends wrap it.

mod backend;
mod contract;
mod error;
mod memory;
mod name;

pub use backend::{
    MAX_VALUE_BYTES, SERVICE, SecretBackend, check_value, delete_secret, get_secret, set_secret,
};
pub use contract::check_backend_contract;
pub use error::SecretError;
pub use memory::MemoryBackend;
pub use name::{MAX_NAME_LENGTH, SecretName};
