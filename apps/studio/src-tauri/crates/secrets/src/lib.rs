//! The keychain rules the Studio shell shares across platforms (HAL-192,
//! interface agreed with Priya on HAL-229).
//!
//! - [`SecretName`]: the `Secrets` port's name rule and canonical form, the
//!   same as the CLI's (requirement `secret-names`).
//! - [`SecretBackend`]: where secrets are kept, with [`get_secret`],
//!   [`has_secret`], [`set_secret`] and [`delete_secret`] checking names and values first
//!   and refusing Halonic's own names (requirement `secret-commands`), and
//!   [`get_token`], [`set_token`] and [`delete_token`] for tokens under
//!   [`TOKEN_PREFIX`] (requirement `token-commands`).
//! - [`allowed_origins`] and [`allow_origin`]: the origins a stored key may
//!   be sent to, kept beside the key (requirement `key-origins`).
//! - [`check_backend_contract`]: the behaviour every backend must show.
//!
//! This crate holds no Tauri types and no keychain crate: the shell's
//! `secret_*` commands and its desktop and Android backends wrap it.

mod backend;
mod contract;
mod error;
mod memory;
mod name;
mod origins;

pub use backend::{
    MAX_VALUE_BYTES, SERVICE, SecretBackend, check_value, delete_secret, delete_token, get_secret,
    get_token, has_secret, set_secret, set_token,
};
pub use contract::check_backend_contract;
pub use error::SecretError;
pub use memory::MemoryBackend;
pub use name::{HALONIC_NAMES, MAX_NAME_LENGTH, SecretName, TOKEN_PREFIX};
pub use origins::{AllowOrigin, MAX_ALLOWED_ORIGINS, allow_origin, allowed_origins};
