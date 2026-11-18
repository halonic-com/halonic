//! Whether the distro's security updates are overdue (security review W2,
//! HAL-5407): read once each time the shell starts the host in the distro,
//! and offered to the page, which adds `security-updates-overdue` to the
//! sandbox choice's residuals. A warning only: the host starts either way.
//!
//! Also the clean-up of import mounts a crash left behind (HAL-5402), run
//! once before the host starts in the distro. Only the updater's fixed
//! `cleanup-import-mounts` step runs, as root; its result is logged and the
//! host starts whatever it says.

use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use halonic_agent_host::{
    RuntimeStep, SecurityUpdates, WslError, run_runtime_step, run_runtime_step_within,
    runtime_command, security_updates,
};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use super::{AgentHostState, HostRefusal, poisoned, running_host};

/// Where the distro's security updates stand, for the page. `last` is when
/// they last ran, as the updater printed it, and `None` when there is no
/// date: they never ran, or the status didn't say.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityUpdatesAnswer {
    overdue: bool,
    last: Option<String>,
}

/// The updater's `status`, read for the distro behind `wsl`. A status that
/// can't be read counts as overdue with no date: a warning beats silence.
pub(super) fn read_in_distro(wsl: &Path) -> SecurityUpdatesAnswer {
    let status = runtime_command(wsl, RuntimeStep::Status).and_then(run_runtime_step);
    answer(status, unix_now())
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

/// What the page is told for the updater's answer.
fn answer(status: Result<String, WslError>, now: i64) -> SecurityUpdatesAnswer {
    match security_updates(status.as_deref().unwrap_or_default(), now) {
        SecurityUpdates::Current => SecurityUpdatesAnswer {
            overdue: false,
            last: None,
        },
        SecurityUpdates::Overdue { last } => SecurityUpdatesAnswer {
            overdue: true,
            last,
        },
    }
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| {
            i64::try_from(elapsed.as_secs()).unwrap_or(i64::MAX)
        })
}

/// The security updates of the distro the host runs in, read when the shell
/// started that host, which this call starts when none runs. `null` when the
/// host runs beside the shell: it has no distro to update.
#[tauri::command]
pub async fn agent_host_security_updates<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<SecurityUpdatesAnswer>, HostRefusal> {
    running_host(&app).await?;
    let state = app.state::<AgentHostState>();
    let read = state.security_updates.lock().map_err(|_| poisoned())?;
    Ok(read.clone())
}

#[cfg(test)]
#[path = "agent_host_updates_tests.rs"]
mod tests;
