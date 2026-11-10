//! The trust records the Studio shell keeps in the profile (HAL-2612).
//!
//! [`FileTrustStore`] keeps them exactly as `FileTrustStore` in
//! `packages/adapters/fs-node` does, so the desktop app and the CLI read and
//! write one folder of records: one JSON file per record, named by the
//! SHA-256 of its location's UTF-16 code units, with the location as the
//! first key (requirement `trust-files`).
//!
//! The store only keeps records. Which folders a grant may open is the
//! shell's rule, not this crate's; `TrustService` in the page decides what
//! is trusted. This crate holds no Tauri types.

mod error;
mod record_file;
mod store;

pub use error::TrustError;
pub use store::FileTrustStore;
