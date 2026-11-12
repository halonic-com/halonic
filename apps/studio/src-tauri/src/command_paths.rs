//! The `command_paths` command (HAL-7876): where each connector's program is
//! on this computer, so the Studio's trust check fingerprints the same path
//! as the CLI's (`apps/cli/src/command-paths.ts`). The rules are in the
//! `halonic-command-paths` crate; this file gives them the PATH.
//!
//! A Studio started from Finder, the Dock or a desktop launcher gets a
//! short PATH, not the one the person's terminal (and so the CLI) has, so on
//! macOS and Linux the login shell's PATH is used when it can be read, as
//! `profile.rs` does for the profile's variables (HAL-5545).

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::sync::OnceLock;
use std::time::Duration;

use halonic_command_paths::find_commands;
use serde::Serialize;
use tauri::{AppHandle, Runtime};

/// How long the login shell may take; then the app's own PATH is used.
const LOGIN_SHELL_WAIT: Duration = Duration::from_secs(5);

/// Windows' own list, for when `PATHEXT` isn't set.
const DEFAULT_ENDINGS: [&str; 4] = [".com", ".exe", ".bat", ".cmd"];

/// Why the paths can't be given. The page shows nothing of it beyond that.
#[derive(Debug, Serialize)]
pub struct CommandPathsRefusal {
    message: String,
}

/// The PATH the CLI would see: the login shell's where it can be asked,
/// else the app's own. Asked once per app run.
fn search_path() -> OsString {
    static PATH: OnceLock<OsString> = OnceLock::new();
    PATH.get_or_init(|| {
        login_path()
            .or_else(|| std::env::var_os("PATH"))
            .unwrap_or_default()
    })
    .clone()
}

#[cfg(all(unix, not(target_os = "android"), not(target_os = "ios")))]
fn login_path() -> Option<OsString> {
    let shell = std::env::var_os("SHELL")
        .filter(|shell| !shell.is_empty())
        .unwrap_or_else(|| {
            if cfg!(target_os = "macos") {
                "/bin/zsh".into()
            } else {
                "/bin/sh".into()
            }
        });
    halonic_login_shell::login_variables(shell.as_ref(), &["PATH"], LOGIN_SHELL_WAIT)
        .map_err(|error| eprintln!("command_paths: the login shell's PATH can't be read: {error}"))
        .ok()?
        .remove("PATH")
}

#[cfg(not(all(unix, not(target_os = "android"), not(target_os = "ios"))))]
fn login_path() -> Option<OsString> {
    let _ = LOGIN_SHELL_WAIT;
    None
}

/// The endings Windows tries, from `PATHEXT`; none elsewhere.
fn endings() -> Vec<String> {
    if !cfg!(windows) {
        return Vec::new();
    }
    match std::env::var("PATHEXT") {
        Ok(list) => list
            .split(';')
            .filter(|ending| !ending.is_empty())
            .map(str::to_owned)
            .collect(),
        Err(_) => DEFAULT_ENDINGS.map(str::to_owned).to_vec(),
    }
}

/// The absolute path of each command found, by the command as written; a
/// command that isn't found is left out. Runs off the main thread: asking
/// the login shell and reading folders may take a while.
#[tauri::command]
pub async fn command_paths<R: Runtime>(
    _app: AppHandle<R>,
    commands: Vec<String>,
) -> Result<BTreeMap<String, String>, CommandPathsRefusal> {
    tauri::async_runtime::spawn_blocking(move || {
        find_commands(&commands, &search_path(), &endings())
    })
    .await
    .map_err(|error| CommandPathsRefusal {
        message: error.to_string(),
    })
}
