//! Starting the host: which one the sandbox choice asks for, and the command
//! that runs it.

use std::path::{Path, PathBuf};
use std::process::Command;

use halonic_agent_host::{
    AgentHost, Handshake, distro_host_command, distro_installed, executable_beside, host_command,
    wsl_exe,
};
use halonic_git_guard::plain_path;
use tauri::{AppHandle, Manager, Runtime};

use super::choice::{HostKind, host_for, saved_backend};
use super::updates::read_in_distro;
use super::{
    AgentHostState, DistroCommand, HostRefusal, Launch, START_WAIT, poisoned, unavailable,
};
use crate::git::GitState;
use crate::profile::cli_profile;

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
            return Ok(running.handshake().clone());
        }
        let (started, updates) = match &state.launch {
            #[cfg(test)]
            Launch::Local(command) => (start_local(command())?, None),
            #[cfg(test)]
            Launch::Distro(command) => (start_in_distro(command)?, None),
            Launch::Real => match chosen_host(&app)? {
                HostKind::Local => (start_local(real_host_command(&app)?)?, None),
                HostKind::Distro => {
                    let (wsl, command) = distro_host_command_for_real_wsl()?;
                    let started = start_in_distro(&command)?;
                    (started, Some(read_in_distro(&wsl)))
                }
            },
        };
        *state.security_updates.lock().map_err(|_| poisoned())? = updates;
        let handshake = started.handshake().clone();
        *host = Some(started);
        Ok(handshake)
    })
    .await
    .map_err(|error| HostRefusal::new("io", error))?
}

fn start_local(command: Command) -> Result<AgentHost, HostRefusal> {
    AgentHost::start(command, START_WAIT).map_err(unavailable)
}

/// Starts the host in the distro with a relay in front of it.
fn start_in_distro(command: &DistroCommand) -> Result<AgentHost, HostRefusal> {
    AgentHost::start_relayed(command, START_WAIT).map_err(unavailable)
}

/// Which host the person's sandbox choice asks for. Without a saved choice
/// it is the platform's default, so on Windows a person who never opened the
/// sandbox panel gets the distro, never a quiet move to the local host. A
/// choice that can't be read refuses the start, naming the file.
fn chosen_host<R: Runtime>(app: &AppHandle<R>) -> Result<HostKind, HostRefusal> {
    let profile = cli_profile(app).map_err(|error| HostRefusal::new("io", error))?;
    let backend = saved_backend(&profile).map_err(unavailable)?;
    Ok(host_for(backend, profile.platform))
}

/// `wsl.exe` and the command for the host in Halonic's distro, once `wsl.exe`
/// is found and lists the distro. Refuses with the sandbox reason when it doesn't: a
/// missing distro never falls back to the local host.
fn distro_host_command_for_real_wsl() -> Result<(PathBuf, DistroCommand), HostRefusal> {
    let system_root = std::env::var("SystemRoot").ok();
    let wsl = wsl_exe(system_root.as_deref())
        .map_err(|error| unavailable(error).with_reason("wsl-missing"))?;
    match distro_installed(&wsl) {
        Ok(true) => {}
        Ok(false) => {
            return Err(
                unavailable("Halonic's WSL distro isn't installed").with_reason("distro-missing")
            );
        }
        Err(error) => return Err(unavailable(error)),
    }
    let command_wsl = wsl.clone();
    Ok((
        wsl,
        Box::new(move |port| distro_host_command(&command_wsl, port)),
    ))
}

/// Starts the host beside the shell and drops it again: the proof that this
/// install's host file runs and answers its handshake, for a PC where the
/// distro host can't start (no WSL, no distro yet).
pub(super) async fn local_host_starts<R: Runtime>(app: &AppHandle<R>) -> bool {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        real_host_command(&app)
            .and_then(start_local)
            .map(drop)
            .is_ok()
    })
    .await
    .unwrap_or(false)
}

/// The host next to the shell's executable, for the CLI's profile, with
/// the folders it may sweep kept grants in.
fn real_host_command<R: Runtime>(app: &AppHandle<R>) -> Result<Command, HostRefusal> {
    let profile = cli_profile(app).map_err(|error| HostRefusal::new("io", error))?;
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
