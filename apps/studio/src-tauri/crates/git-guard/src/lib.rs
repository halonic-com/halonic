//! Runs git for the Studio shell (HAL-192, closing HAL-6 finding 7).
//!
//! The old shell blocked six option names by exact text, and git accepts
//! shortened option names, so `--upload-pac=` got through. This crate turns
//! that around: [`check_args`] allows only listed subcommands, each with its
//! own list of options, matched exactly (requirement `git-allow-list`).
//!
//! This crate holds no Tauri types: the shell's `git` command is a thin
//! wrapper around it.

mod allow_list;
mod check_args;
mod error;

pub use check_args::{CheckedCall, check_args};
pub use error::GitError;
