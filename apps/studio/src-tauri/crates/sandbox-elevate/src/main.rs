//! `halonic-sandbox-elevate.exe setup` or `remove`. See the library.

// No console window: Studio starts it hidden, and Windows Settings starts it
// from Installed apps.
#![cfg_attr(windows, windows_subsystem = "windows")]

use halonic_sandbox_elevate::{code, verb};
use std::ffi::OsString;

fn main() {
    // Before anything else loads a library, so no planted one is used.
    #[cfg(windows)]
    if halonic_sandbox_elevate::system32_only_libraries().is_err() {
        std::process::exit(code::SRT_WIN_DIDNT_START);
    }
    let args: Vec<OsString> = std::env::args_os().skip(1).collect();
    let Some(verb) = verb(&args) else {
        std::process::exit(code::USAGE);
    };
    std::process::exit(run(verb));
}

#[cfg(windows)]
fn run(verb: halonic_sandbox_elevate::Verb) -> i32 {
    halonic_sandbox_elevate::run(
        verb,
        &halonic_sandbox_elevate::Windows,
        halonic_sandbox_elevate::SRT_WIN_SHA256,
        halonic_sandbox_elevate::SIGNER,
    )
}

/// The sandbox this helper sets up exists only on Windows.
#[cfg(not(windows))]
fn run(_verb: halonic_sandbox_elevate::Verb) -> i32 {
    code::USAGE
}
