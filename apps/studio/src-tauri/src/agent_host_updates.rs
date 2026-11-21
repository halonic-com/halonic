//! Whether the distro's security updates are overdue (security review W2,
//! HAL-5407), and whether it is the person's default WSL distro (W6,
//! HAL-12445): read once each time the shell starts the host in the distro,
//! and offered to the page, which adds `security-updates-overdue` and
//! `default-distro` to the sandbox choice's residuals. Warnings only: the
//! host starts either way.
//!
//! Also the clean-up of import mounts a crash left behind (HAL-5402), run
//! once before the host starts in the distro. Only the updater's fixed
//! `cleanup-import-mounts` step runs, as root; its result is logged and the
//! host starts whatever it says.
//!
//! And the security updates themselves (HAL-12444): the updater's fixed
//! `security-update` step, run before the host starts in the distro, when
//! no session can run yet, so a `bwrap` never holds them off. The updater
//! runs them at most once a day; the result is logged and the host starts
//! whatever it says.
//!
//! And the runtime this Studio ships (HAL-14644): installed by the updater's
//! `install` step before the host starts in the distro, when the distro's
//! `current` runtime is another version or none, so a Studio update brings
//! its runtime and a distro set up without one gets it.

use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use halonic_agent_host::{
    BundledRuntime, RuntimeStep, RuntimeUpdate, SecurityUpdates, WslError, bundled_runtime,
    current_runtime, halonic_is_default, run_runtime_step_within, runtime_command,
    security_updates, update_runtime,
};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use super::{AgentHostState, HostRefusal, poisoned, running_host};

/// What the shell read about the distro when it started the host there, for
/// the page. `overdue` and `last` are the security updates: `last` is when
/// they last ran, as the updater printed it, and `None` when there is no
/// date (they never ran, or the status didn't say). `is_default_distro` is
/// whether a plain `wsl` opens the distro.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistroStartChecks {
    overdue: bool,
    last: Option<String>,
    is_default_distro: bool,
}

/// How long reading the updater's `status` may take. It runs while the host
/// lock is held, so a hung `wsl.exe` must not hold up every `agent_host_*`
/// call.
const STATUS_LIMIT: Duration = Duration::from_secs(10);

/// How long reading WSL's default distro may take. A hung `wsl.exe` must not
/// hold up start-up.
const DEFAULT_DISTRO_LIMIT: Duration = Duration::from_secs(10);

/// The updater's `status` and WSL's default distro, read for the distro
/// behind `wsl`. A status that can't be read in time counts as overdue with
/// no date: a warning beats silence. A default that can't be read counts as
/// not the distro, and is logged: telling the person to change their default
/// would be wrong advice when we don't know it.
pub(super) fn read_in_distro(wsl: &Path) -> DistroStartChecks {
    let mut checks = security_updates_in_distro(wsl, STATUS_LIMIT);
    checks.is_default_distro = default_distro(halonic_is_default(wsl, DEFAULT_DISTRO_LIMIT));
    checks
}

/// The security updates of the distro behind `wsl`, from the updater's
/// `status`, which is stopped after `limit`.
fn security_updates_in_distro(wsl: &Path, limit: Duration) -> DistroStartChecks {
    let status = runtime_command(wsl, RuntimeStep::Status)
        .and_then(|command| run_runtime_step_within(command, limit));
    answer(status, unix_now())
}

/// Whether the page is told the distro is the default, logging why when it
/// can't say.
fn default_distro(read: Result<Option<bool>, WslError>) -> bool {
    match read {
        Ok(Some(is_default)) => is_default,
        Ok(None) => {
            halonic_shell_log::record(
                "wsl",
                "default distro: WSL's list marks no default, so none is reported",
            );
            false
        }
        Err(error) => {
            halonic_shell_log::record(
                "wsl",
                format!("default distro: couldn't read WSL's list, so none is reported: {error}"),
            );
            false
        }
    }
}

/// How long the security updates may take before the host starts without
/// waiting for them. Enough for a day's Debian security updates on a slow
/// line; a stuck download must not hold up start-up for good.
const SECURITY_UPDATE_LIMIT: Duration = Duration::from_secs(180);

/// Runs the distro's security updates, which the updater skips when they
/// ran in the last 24 hours, and logs what happened. Never fails: a step
/// that can't start, fails or takes longer than [`SECURITY_UPDATE_LIMIT`]
/// is logged, the host starts anyway, and `status` says how old the last
/// updates are.
pub(super) fn run_security_update(wsl: &Path) {
    let result = runtime_command(wsl, RuntimeStep::SecurityUpdate)
        .and_then(|command| run_runtime_step_within(command, SECURITY_UPDATE_LIMIT));
    halonic_shell_log::record("wsl", security_update_log(result));
}

/// The log line for the security updates' ending: the updater's last line,
/// which says whether they were installed or skipped, after apt's own.
fn security_update_log(result: Result<String, WslError>) -> String {
    match result {
        Ok(printed) => {
            let last = printed.lines().rev().find(|line| !line.trim().is_empty());
            format!("security updates: {}", last.unwrap_or_default().trim())
        }
        Err(error) => {
            format!("security updates: they didn't finish, starting anyway: {error}")
        }
    }
}

/// How long the clean-up may take before the host starts without waiting
/// for it. Unmounting a Windows folder is quick; a stuck one must not hold
/// up start-up.
const CLEANUP_LIMIT: Duration = Duration::from_secs(20);

/// Removes the import mounts a crash left in the distro behind `wsl`, and
/// logs what it did. Never fails: a step that can't start, fails or takes
/// longer than [`CLEANUP_LIMIT`] is logged and the host starts anyway.
pub(super) fn clean_import_mounts(wsl: &Path) {
    let result = runtime_command(wsl, RuntimeStep::CleanupImportMounts)
        .and_then(|command| run_runtime_step_within(command, CLEANUP_LIMIT));
    halonic_shell_log::record("wsl", cleanup_log(result));
}

/// The log line for the clean-up's ending.
fn cleanup_log(result: Result<String, WslError>) -> String {
    match result {
        Ok(printed) => format!("import mounts: {}", printed.trim()),
        Err(error) => {
            format!("import mounts: the clean-up didn't finish, starting anyway: {error}")
        }
    }
}

/// How long installing the runtime may take before it is stopped: the
/// archive is sent and unpacked in the distro, which WSL may start first. A
/// stuck install must not hold up the start for good.
const RUNTIME_INSTALL_LIMIT: Duration = Duration::from_secs(300);

/// Installs the runtime beside the app in `app_folder` into the distro
/// behind `wsl`, unless the updater's `status` names it as `current`, and
/// logs what happened. A build that ships no runtime keeps the distro's.
///
/// # Errors
///
/// Only when the runtime couldn't be installed and the distro has none to
/// start; with one, the host starts on it and the log says why.
pub(super) fn install_bundled_runtime(wsl: &Path, app_folder: &Path) -> Result<(), String> {
    let status = runtime_command(wsl, RuntimeStep::Status)
        .and_then(|command| run_runtime_step_within(command, STATUS_LIMIT));
    let current = status.ok().as_deref().and_then(current_runtime);
    let update = bundled_runtime(app_folder).and_then(|bundled| {
        bundled
            .map(|bundled| {
                update_runtime(wsl, &bundled, current.as_deref(), RUNTIME_INSTALL_LIMIT)
                    .map(|update| (bundled, update))
            })
            .transpose()
    });
    let (line, outcome) = runtime_ending(current.as_deref(), update);
    halonic_shell_log::record("wsl", line);
    outcome
}

/// The log line for the runtime's install, and whether the host may start:
/// it may unless the install failed with no runtime in the distro.
fn runtime_ending(
    current: Option<&str>,
    update: Result<Option<(BundledRuntime, RuntimeUpdate)>, WslError>,
) -> (String, Result<(), String>) {
    let kept = current.unwrap_or("none");
    match update {
        Ok(None) => (
            format!("runtime: this build ships none, keeping the distro's ({kept})"),
            Ok(()),
        ),
        Ok(Some((bundled, RuntimeUpdate::AlreadyCurrent))) => {
            (format!("runtime: {} is current", bundled.version), Ok(()))
        }
        Ok(Some((bundled, RuntimeUpdate::Installed))) => (
            format!("runtime: installed {} (was {kept})", bundled.version),
            Ok(()),
        ),
        Err(error) if current.is_some() => (
            format!("runtime: couldn't install this build's, starting {kept}: {error}"),
            Ok(()),
        ),
        Err(error) => {
            let reason =
                format!("the runtime couldn't be installed in Halonic's WSL distro: {error}");
            (format!("runtime: {reason}"), Err(reason))
        }
    }
}

/// What the page is told for the updater's answer, before the default
/// distro is read.
fn answer(status: Result<String, WslError>, now: i64) -> DistroStartChecks {
    let (overdue, last) = match security_updates(status.as_deref().unwrap_or_default(), now) {
        SecurityUpdates::Current => (false, None),
        SecurityUpdates::Overdue { last } => (true, last),
    };
    DistroStartChecks {
        overdue,
        last,
        is_default_distro: false,
    }
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| {
            i64::try_from(elapsed.as_secs()).unwrap_or(i64::MAX)
        })
}

/// The start checks of the distro the host runs in: its security updates
/// and whether it is WSL's default distro, read when the shell started that
/// host, which this call starts when none runs. `null` when the host runs
/// beside the shell: it has no distro. The name stays from when it carried
/// the security updates alone.
#[tauri::command]
pub async fn agent_host_security_updates<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<DistroStartChecks>, HostRefusal> {
    running_host(&app).await?;
    let state = app.state::<AgentHostState>();
    let read = state.start_checks.lock().map_err(|_| poisoned())?;
    Ok(read.clone())
}

#[cfg(test)]
#[path = "agent_host_updates_tests.rs"]
mod tests;
