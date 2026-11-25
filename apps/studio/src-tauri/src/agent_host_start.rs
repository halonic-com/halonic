//! Starting the host: which one the sandbox choice asks for, and the command
//! that runs it. Each start's outcome is kept for `start_status`. The real
//! hosts keep their own secrets in the OS keychain: the shell answers for
//! them on the host's pipe (requirement `host-secrets-channel`).

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;

use halonic_agent_host::{
    AgentHost, AgentHostError, Handshake, SettingCopy, WslError, copy_sandbox_setting,
    distro_host_command, distro_installed_within, executable_beside, host_command, wsl_exe,
};
use halonic_git_guard::plain_path;
use halonic_host_settings::SandboxSetting;
use halonic_secrets::SecretBackend;
use tauri::{AppHandle, Manager, Runtime};

use super::choice::{HostKind, host_for, saved_setting};
use super::progress::{FailureCause, StartFailure};
use super::updates::{
    DistroStartChecks, clean_import_mounts, install_bundled_runtime, read_in_distro,
    run_security_update,
};
use super::{
    AgentHostState, DistroCommand, HostRefusal, Launch, START_WAIT, poisoned, unavailable,
};
use crate::git::GitState;
use crate::profile::cli_profile;
use crate::secrets::SecretsState;

/// The running host's handshake, starting the host first when there is
/// none or it has exited. It starts on a worker thread: it unpacks files
/// and waits for the host's first line.
pub(super) async fn running_host<R: Runtime>(app: &AppHandle<R>) -> Result<Handshake, HostRefusal> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AgentHostState>();
        let mut host = state.host.lock().map_err(|_| poisoned())?;
        if let Some(running) = host.as_mut()
            && !running.has_exited()
        {
            state.progress.host_started();
            running.name_workspaces(&opened_folders(&app));
            return Ok(running.handshake().clone());
        }
        let (mut started, updates) = match start_host(&app, &state) {
            Ok(started) => {
                state.progress.host_started();
                started
            }
            Err(refusal) => {
                state.progress.host_failed(refusal.failure);
                return Err(refusal);
            }
        };
        *state.start_checks.lock().map_err(|_| poisoned())? = updates;
        // A folder opened while the host started, after its command was made.
        started.name_workspaces(&opened_folders(&app));
        let handshake = started.handshake().clone();
        *host = Some(started);
        // The background engines run harness steps through this host too.
        #[cfg(desktop)]
        crate::engines::sandbox_host_changed(&app, Some(&handshake));
        Ok(handshake)
    })
    .await
    .map_err(|error| HostRefusal::new("io", error))?
}

/// Starts the host the launch asks for, and for the host in the distro reads
/// its start checks. Notes when WSL is ready, before the host starts in it.
fn start_host<R: Runtime>(
    app: &AppHandle<R>,
    state: &AgentHostState,
) -> Result<(AgentHost, Option<DistroStartChecks>), HostRefusal> {
    match &state.launch {
        #[cfg(test)]
        Launch::Local(command) => Ok((start_local(command(), None)?, None)),
        #[cfg(test)]
        Launch::Distro(command) => {
            state.progress.wsl_ready();
            Ok((start_in_distro(command, None)?, None))
        }
        Launch::Real => match chosen_host(app)? {
            (HostKind::Local, _) => {
                let started = start_local(real_host_command(app)?, Some(host_keychain(app)))?;
                Ok((started, None))
            }
            (HostKind::Distro, setting) => {
                let (wsl, command) = distro_host_command_for_real_wsl()?;
                state.progress.wsl_ready();
                clean_import_mounts(&wsl);
                install_runtime_beside_shell(&wsl)?;
                copy_into_distro(&wsl, setting.as_ref())?;
                run_security_update(&wsl);
                let started = start_in_distro(&command, Some(host_keychain(app)))?;
                Ok((started, Some(read_in_distro(&wsl))))
            }
        },
    }
}

/// Starts the host beside the shell; with `secrets`, the shell answers for
/// the host's own secrets from it.
pub(super) fn start_local(
    command: Command,
    secrets: Option<Arc<dyn SecretBackend>>,
) -> Result<AgentHost, HostRefusal> {
    AgentHost::start_answering_secrets(command, START_WAIT, secrets).map_err(host_failed)
}

/// Starts the host in the distro with a relay in front of it; with
/// `secrets`, the relay answers for the host's own secrets from it.
fn start_in_distro(
    command: &DistroCommand,
    secrets: Option<Arc<dyn SecretBackend>>,
) -> Result<AgentHost, HostRefusal> {
    AgentHost::start_relayed_answering_secrets(command, START_WAIT, secrets).map_err(host_failed)
}

/// The shell's keychain, for the real host's own secrets.
pub(super) fn host_keychain<R: Runtime>(app: &AppHandle<R>) -> Arc<dyn SecretBackend> {
    app.state::<SecretsState>().host_keychain()
}

/// The refusal for a host that didn't start, with the cause and exit code
/// `start_status` reports.
fn host_failed(error: AgentHostError) -> HostRefusal {
    let failure = StartFailure::from(&error);
    unavailable(error).with_failure(failure)
}

/// Which host the person's sandbox choice asks for, and the choice. Without
/// a saved choice it is the platform's default, so on Windows a person who
/// never opened the sandbox panel gets the distro, never a quiet move to the
/// local host. A choice that can't be read refuses the start, naming the file.
pub(super) fn chosen_host<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(HostKind, Option<SandboxSetting>), HostRefusal> {
    let profile = cli_profile(app).map_err(HostRefusal::from)?;
    let setting = saved_setting(&profile).map_err(unavailable)?;
    let backend = setting.as_ref().map(|setting| setting.backend());
    Ok((host_for(backend, profile.platform), setting))
}

/// Installs the runtime beside the shell into the distro (HAL-14644) before
/// anything runs the distro's host, refusing the start only when the install
/// failed and `status` answered that the distro has no runtime.
fn install_runtime_beside_shell(wsl: &Path) -> Result<(), HostRefusal> {
    let shell = std::env::current_exe().map_err(|error| HostRefusal::new("io", error))?;
    let folder = shell
        .parent()
        .ok_or_else(|| HostRefusal::new("io", "the app has no folder"))?;
    install_bundled_runtime(wsl, folder).map_err(runtime_missing)
}

/// The refusal for a distro left without a runtime to start: the sandbox
/// reason `runtime-missing` (HAL-15132), so Studio can word it without a
/// running host to ask and tell the person to try again, which installs the
/// runtime again (HAL-16277), and the start cause that Welcome counts as a
/// sandbox not set up yet.
fn runtime_missing(error: String) -> HostRefusal {
    unavailable(error)
        .with_reason("runtime-missing")
        .with_failure(StartFailure::of(FailureCause::RuntimeMissing))
}

/// Makes the distro's copy of the choice match the one saved on Windows
/// (HAL-13319): the host there reads only its copy. A copy that can't be
/// made refuses, so the distro's host never runs on an older choice.
pub(super) fn copy_into_distro(
    wsl: &Path,
    setting: Option<&SandboxSetting>,
) -> Result<(), HostRefusal> {
    let copy = match setting {
        Some(setting) => SettingCopy::Save(setting.text()),
        None => SettingCopy::Remove,
    };
    copy_sandbox_setting(wsl, copy).map_err(|error| {
        unavailable(format!(
            "the sandbox choice couldn't be copied into Halonic's WSL distro: {error}"
        ))
    })
}

/// How long `wsl.exe` may take to list the distros before the start gives up
/// on it: the list runs while the host's lock is held, so a hung WSL service
/// would otherwise hold up every host call.
const LIST_LIMIT: Duration = Duration::from_secs(20);

/// `wsl.exe` and the command for the host in Halonic's distro, once `wsl.exe`
/// is found and lists the distro. Refuses with the sandbox reason when it doesn't: a
/// missing distro never falls back to the local host.
pub(super) fn distro_host_command_for_real_wsl() -> Result<(PathBuf, DistroCommand), HostRefusal> {
    let system_root = std::env::var("SystemRoot").ok();
    let wsl = wsl_exe(system_root.as_deref()).map_err(|error| {
        unavailable(error)
            .with_reason("wsl-missing")
            .with_failure(StartFailure::of(FailureCause::WslMissing))
    })?;
    distro_host_command_for(wsl, LIST_LIMIT)
}

/// [`distro_host_command_for_real_wsl`] for a found `wsl.exe`, which has
/// `limit` to list the distros; one that hasn't by then fails as `wsl_failed`.
fn distro_host_command_for(
    wsl: PathBuf,
    limit: Duration,
) -> Result<(PathBuf, DistroCommand), HostRefusal> {
    match distro_installed_within(&wsl, limit) {
        Ok(true) => {}
        Ok(false) => {
            return Err(unavailable("Halonic's WSL distro isn't installed")
                .with_reason("distro-missing")
                .with_failure(StartFailure::of(FailureCause::DistroMissing)));
        }
        Err(error) => {
            let failure = wsl_failure(&error);
            return Err(unavailable(error).with_failure(failure));
        }
    }
    let command_wsl = wsl.clone();
    Ok((
        wsl,
        Box::new(move |port| distro_host_command(&command_wsl, port)),
    ))
}

/// Why `wsl.exe` couldn't list the distros, with its exit code when it ran.
fn wsl_failure(error: &WslError) -> StartFailure {
    StartFailure {
        cause: FailureCause::WslFailed,
        exit_code: match error {
            WslError::Failed(code) => *code,
            _ => None,
        },
    }
}

/// Starts the host beside the shell and drops it again: the proof that this
/// install's host file runs and answers its handshake, for a PC where the
/// distro host can't start (no WSL, no distro yet). It starts as the real
/// one does, keychain included, so it never keeps a secret in its file.
pub(super) async fn local_host_starts<R: Runtime>(app: &AppHandle<R>) -> bool {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        real_host_command(&app)
            .and_then(|command| start_local(command, Some(host_keychain(&app))))
            .map(drop)
            .is_ok()
    })
    .await
    .unwrap_or(false)
}

/// The host next to the shell's executable, for the CLI's profile, with
/// the folders it may sweep kept grants in.
pub(super) fn real_host_command<R: Runtime>(app: &AppHandle<R>) -> Result<Command, HostRefusal> {
    let profile = cli_profile(app).map_err(HostRefusal::from)?;
    let shell = std::env::current_exe().map_err(|error| HostRefusal::new("io", error))?;
    let executable = executable_beside(&shell).map_err(unavailable)?;
    let profile = Path::new(&profile.root);
    let opened = app.state::<GitState>().folders().list();
    Ok(host_command(
        &executable,
        profile,
        &sweep_roots(profile, &opened),
    ))
}

/// The folders the person has open now, in the form `--sweep-root` names
/// them, for naming the ones opened since the host started (requirement
/// `opened-workspaces`): a host whose workspace routes don't know a folder
/// refuses it as `unknown_workspace`. Only a host beside the shell is told.
/// An app without the folders' state (the commands' tests) has none open.
pub(super) fn opened_folders<R: Runtime>(app: &AppHandle<R>) -> Vec<PathBuf> {
    let Some(git) = app.try_state::<GitState>() else {
        return Vec::new();
    };
    git.folders()
        .list()
        .iter()
        .map(|folder| PathBuf::from(plain_path(folder)))
        .collect()
}

/// The folders the host sweeps kept Windows grants in (HAL-6256): the
/// profile, which holds every session's temp folder and every workspace's
/// runs, and each folder the person has open now, which holds working
/// folders such as `files/agents/<name>`. Without the long-path prefix,
/// as srt-win lists its grants.
pub(super) fn sweep_roots(profile: &Path, opened: &[PathBuf]) -> Vec<PathBuf> {
    std::iter::once(profile.to_owned())
        .chain(
            opened
                .iter()
                .map(|folder| PathBuf::from(plain_path(folder))),
        )
        .collect()
}

#[cfg(test)]
#[path = "agent_host_start_tests.rs"]
mod tests;
