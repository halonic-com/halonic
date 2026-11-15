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
//!
//! [`FileInstructionTrustStore`] does the same for the instructions a person
//! trusted for an agent, as `FileInstructionTrustStore` in `fs-node` does
//! (requirement `instruction-trust-files`).

mod error;
mod instruction_record;
mod instruction_store;
mod record_file;
mod store;
mod unlinked;

pub use error::TrustError;
pub use instruction_record::{InstructionKey, InstructionPin, InstructionRecord};
pub use instruction_store::{FileInstructionTrustStore, instruction_file_name};
pub use store::{FileTrustStore, Listing};
