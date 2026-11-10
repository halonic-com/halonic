//! The run lock the Studio shell shares with the CLI. While a writer appends
//! to a run, it holds `<runId>.lock` next to the run's log, so a CLI and the
//! desktop app writing one run exclude each other and one of them gets
//! `conflict` instead of both winning.
//!
//! The format and the rules are `RunLockRecord`'s in `@halonicjs/ports`,
//! the same as `withRunLock` in `fs-node` follows: this crate writes the
//! record byte for byte as Node does, and judges every lock in
//! `tests/fixtures/run-lock-cases.json` as Node does. Plain Rust with no
//! Tauri types; the shell's run store wraps it.

mod iso_time;
mod record;

pub use record::{FoundLock, LockRecord, STALE_AFTER_MS, is_stale, parse_record, record_text};
