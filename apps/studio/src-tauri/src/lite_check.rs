//! The `lite_check` command (HAL-13408; design HAL-7986, first-run-progress
//! 3.2): the checks the window can run on its own when Halonic's engine
//! didn't start, so without Node and without the agent host. The Welcome
//! page's **Check this computer** shows them; the engine's own checks show
//! as not checked there.
//!
//! - `app_files`: Halonic's files are next to the app: the agent host, and
//!   on Windows the sandbox programs the installer puts beside it.
//! - `profile_writable`: a probe file can be made and removed in the
//!   profile folder the CLI uses.
//! - `disk_space`: the free space on the profile's drive, low below 1 GiB,
//!   as `halonic doctor` counts it.
//! - Windows only, `wsl_distro` and `wsl_runtime`: Halonic's WSL distro is
//!   installed, and a runtime is installed in it.
//!
//! Each result is an id and a fact from a fixed list, with the free bytes
//! for `disk_space`. None holds a path, a name or an error message.

use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use halonic_agent_host::executable_beside;
use halonic_resource_probe::free_disk_bytes;
use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::profile::cli_profile;

/// Below this much free space, `disk_space` is `low`: 1 GiB, as the status
/// bar and `halonic doctor` count it.
const LOW_DISK_BYTES: u64 = 1024 * 1024 * 1024;

/// What the window checked.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckId {
    AppFiles,
    ProfileWritable,
    DiskSpace,
    // Windows only: only the WSL checks make these.
    #[cfg_attr(not(windows), allow(dead_code))]
    WslDistro,
    #[cfg_attr(not(windows), allow(dead_code))]
    WslRuntime,
}

/// What it found.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Fact {
    /// The files, the distro or the runtime are there.
    Present,
    /// One of them isn't.
    Missing,
    /// The profile folder takes a new file.
    Writable,
    /// It doesn't.
    NotWritable,
    /// The profile folder can't be found, so it couldn't be checked.
    NoProfile,
    /// At least 1 GiB is free.
    Enough,
    /// Less than 1 GiB is free.
    Low,
    /// Windows: `wsl.exe` isn't there, so WSL isn't installed.
    #[cfg_attr(not(windows), allow(dead_code))]
    WslMissing,
    /// The answer couldn't be read.
    Unknown,
    /// It depends on another check that failed: the runtime of a distro
    /// that isn't there. Windows only.
    #[cfg_attr(not(windows), allow(dead_code))]
    NotChecked,
}

/// One result: what was checked and what was found.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    id: CheckId,
    fact: Fact,
    /// The free space in bytes, for `disk_space` when it could be read.
    #[serde(skip_serializing_if = "Option::is_none")]
    free_bytes: Option<u64>,
}

impl CheckResult {
    const fn new(id: CheckId, fact: Fact) -> Self {
        Self {
            id,
            fact,
            free_bytes: None,
        }
    }
}

/// Runs every check, on a worker thread: the WSL ones start `wsl.exe`.
/// Never fails: a check that can't answer says `unknown`.
#[tauri::command]
pub async fn lite_check<R: Runtime>(app: AppHandle<R>) -> Vec<CheckResult> {
    let profile = cli_profile(&app)
        .ok()
        .map(|profile| PathBuf::from(profile.root));
    tauri::async_runtime::spawn_blocking(move || run_checks(profile.as_deref()))
        .await
        .unwrap_or_default()
}

fn run_checks(profile: Option<&Path>) -> Vec<CheckResult> {
    let mut results = vec![
        app_files(std::env::current_exe().ok().as_deref()),
        profile_writable(profile),
        disk_space(profile.map(free_disk_bytes)),
    ];
    results.extend(platform_checks());
    results
}

#[cfg(windows)]
fn platform_checks() -> Vec<CheckResult> {
    wsl::checks().to_vec()
}

#[cfg(not(windows))]
fn platform_checks() -> Vec<CheckResult> {
    Vec::new()
}

/// The files the app needs beside it: the agent host, and on Windows the
/// sandbox programs the installer puts there.
fn app_files(app: Option<&Path>) -> CheckResult {
    let all_there = app.is_some_and(|app| {
        executable_beside(app).is_ok_and(|host| is_file_with_content(&host))
            && beside_host_on_windows(app)
    });
    CheckResult::new(
        CheckId::AppFiles,
        if all_there {
            Fact::Present
        } else {
            Fact::Missing
        },
    )
}

/// The installer's other programs beside the app on Windows, which the
/// sandbox needs (`tauri.installer.conf.json`).
#[cfg(windows)]
const WINDOWS_FILES: [&str; 2] = ["halonic-sandbox-elevate.exe", "srt-win.exe"];

#[cfg(windows)]
fn beside_host_on_windows(app: &Path) -> bool {
    app.parent().is_some_and(|folder| {
        WINDOWS_FILES
            .iter()
            .all(|name| is_file_with_content(&folder.join(name)))
    })
}

#[cfg(not(windows))]
fn beside_host_on_windows(_app: &Path) -> bool {
    true
}

fn is_file_with_content(path: &Path) -> bool {
    std::fs::metadata(path).is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0)
}

/// Makes the profile folder when it isn't there yet, as the first start
/// would, then makes a probe file in it and removes it.
fn profile_writable(profile: Option<&Path>) -> CheckResult {
    let fact = match profile {
        None => Fact::NoProfile,
        Some(folder) => match write_probe(folder) {
            Ok(()) => Fact::Writable,
            Err(_) => Fact::NotWritable,
        },
    };
    CheckResult::new(CheckId::ProfileWritable, fact)
}

fn write_probe(folder: &Path) -> io::Result<()> {
    std::fs::create_dir_all(folder)?;
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.subsec_nanos());
    let probe = folder.join(format!(
        ".halonic-write-check-{}-{nanos}",
        std::process::id()
    ));
    let written = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .and_then(|mut file| file.write_all(b"ok"));
    // Removed even when the write failed after the file was made.
    let removed = std::fs::remove_file(&probe);
    written.and(removed)
}

fn disk_space(free: Option<io::Result<u64>>) -> CheckResult {
    match free {
        Some(Ok(bytes)) => CheckResult {
            id: CheckId::DiskSpace,
            fact: if bytes < LOW_DISK_BYTES {
                Fact::Low
            } else {
                Fact::Enough
            },
            free_bytes: Some(bytes),
        },
        Some(Err(_)) | None => CheckResult::new(CheckId::DiskSpace, Fact::Unknown),
    }
}

/// Halonic's WSL distro and its runtime, read as the host's start reads them.
#[cfg(windows)]
mod wsl {
    use std::time::Duration;

    use halonic_agent_host::{
        RuntimeStep, distro_installed_within, run_runtime_step_within, runtime_command,
        runtime_installed, wsl_exe,
    };

    use super::{CheckId, CheckResult, Fact};

    /// How long listing WSL's distros may take. A hung WSL service is one
    /// reason the engine doesn't start, so the check must still answer then.
    const LIST_LIMIT: Duration = Duration::from_secs(20);

    /// How long the updater's `status` may take: it only reads a few files.
    const STATUS_LIMIT: Duration = Duration::from_secs(20);

    pub(super) fn checks() -> [CheckResult; 2] {
        let system_root = std::env::var("SystemRoot").ok();
        let Ok(wsl) = wsl_exe(system_root.as_deref()) else {
            return [
                CheckResult::new(CheckId::WslDistro, Fact::WslMissing),
                CheckResult::new(CheckId::WslRuntime, Fact::NotChecked),
            ];
        };
        let distro = match distro_installed_within(&wsl, LIST_LIMIT) {
            Ok(true) => Fact::Present,
            Ok(false) => Fact::Missing,
            // Also when the listing timed out.
            Err(_) => Fact::Unknown,
        };
        let runtime = if distro == Fact::Present {
            runtime_fact(&wsl)
        } else {
            Fact::NotChecked
        };
        [
            CheckResult::new(CheckId::WslDistro, distro),
            CheckResult::new(CheckId::WslRuntime, runtime),
        ]
    }

    fn runtime_fact(wsl: &std::path::Path) -> Fact {
        let status = runtime_command(wsl, RuntimeStep::Status)
            .and_then(|command| run_runtime_step_within(command, STATUS_LIMIT));
        match status {
            Ok(status) if runtime_installed(&status) => Fact::Present,
            Ok(_) => Fact::Missing,
            Err(_) => Fact::Unknown,
        }
    }
}

#[cfg(test)]
#[path = "lite_check_tests.rs"]
mod tests;
