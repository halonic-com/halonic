//! The messaging host beside the shell (requirement `agent-host-messaging`,
//! HAL-18311). On Windows the harnesses' host usually runs in Halonic's WSL
//! distro, which sees other paths than the shell's, so it can't read the
//! workspaces the person opens and can't serve Inbox, Messenger or Settings ›
//! Connections for them. There the shell also starts the host beside itself
//! with `--messaging-only`, which serves only the messaging's and Paperclip's
//! routes and runs no agent, and sends those calls to it. Everywhere else
//! the one host serves both, and no second process starts.

use std::process::Command;
use std::sync::Arc;

use halonic_agent_host::Handshake;
use halonic_profile::Platform;
use halonic_secrets::SecretBackend;
use tauri::{AppHandle, Manager, Runtime};

use super::choice::{messaging_host_for, saved_backend};
use super::start::{host_keychain, opened_folders, real_host_command, running_host, start_local};
use super::{AgentHostState, HostRefusal, Launch, poisoned, unavailable};
use crate::profile::cli_profile;

/// The paths the messaging host serves, as the host's `messagingOnlyPrefixes`
/// (`apps/agent-host/src/messaging-only.ts`) names them. The shell sends a
/// call under one of them to the messaging host where one runs, and every
/// other call to the harnesses' host.
pub(super) const MESSAGING_PREFIXES: [&str; 2] = ["/v1/messaging/", "/v1/paperclip/"];

/// The argument that starts the host in messaging-only mode (requirement
/// `agent-host.messaging-only`).
const MESSAGING_ONLY_ARG: &str = "--messaging-only";

/// The command that starts the messaging host, and the keychain that
/// answers for its secrets.
type MessagingLaunch = (Command, Option<Arc<dyn SecretBackend>>);

/// Whether a call to `path` goes to the messaging host where one runs.
pub(super) fn is_messaging_path(path: &str) -> bool {
    MESSAGING_PREFIXES
        .iter()
        .any(|prefix| path.starts_with(prefix))
}

/// The handshake of the host that serves `path`: the messaging host for a
/// messaging path where one runs, otherwise the harnesses' host.
pub(super) async fn host_serving<R: Runtime>(
    app: &AppHandle<R>,
    path: &str,
) -> Result<Handshake, HostRefusal> {
    if is_messaging_path(path)
        && let Some(handshake) = running_messaging_host(app).await?
    {
        return Ok(handshake);
    }
    running_host(app).await
}

/// The running messaging host's handshake, starting it first when there is
/// none or it has exited; `None` where the harnesses' host serves the
/// messaging too. As for that host, the folders opened since it started are
/// named to it before each call, and there is only ever one, kept in
/// [`AgentHostState`], so two never run on one profile folder.
pub(super) async fn running_messaging_host<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<Handshake>, HostRefusal> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AgentHostState>();
        let mut host = state.messaging_host.lock().map_err(|_| poisoned())?;
        if let Some(running) = host.as_mut()
            && !running.has_exited()
        {
            running.name_workspaces(&opened_folders(&app));
            return Ok(Some(running.handshake().clone()));
        }
        // One that exited is dropped, whether or not a new one is wanted.
        drop(host.take());
        let Some((command, secrets)) = messaging_launch(&app, &state)? else {
            return Ok(None);
        };
        let mut started = start_local(command, secrets)?;
        // A folder opened while the host started, after its command was made.
        started.name_workspaces(&opened_folders(&app));
        let handshake = started.handshake().clone();
        *host = Some(started);
        Ok(Some(handshake))
    })
    .await
    .map_err(|error| HostRefusal::new("io", error))?
}

/// The command for the messaging host and the keychain that answers for its
/// secrets, or `None` where none is wanted.
fn messaging_launch<R: Runtime>(
    app: &AppHandle<R>,
    state: &AgentHostState,
) -> Result<Option<MessagingLaunch>, HostRefusal> {
    match &state.launch {
        Launch::Real => real_messaging_launch(app),
        #[cfg(test)]
        Launch::Local(_) | Launch::Distro(_) => Ok(state
            .messaging_launch
            .as_ref()
            .map(|command| (command(), None))),
    }
}

/// The local host with `--messaging-only`, for the same profile and with
/// the same `--sweep-root`s as the harnesses' host would have, where the
/// sandbox choice asks for one (`messaging_host_for`).
fn real_messaging_launch<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<MessagingLaunch>, HostRefusal> {
    let profile = cli_profile(app).map_err(HostRefusal::from)?;
    // Only Windows ever wants one; elsewhere the choice isn't read for it.
    if profile.platform != Platform::Windows {
        return Ok(None);
    }
    let backend = saved_backend(&profile).map_err(unavailable)?;
    if !messaging_host_for(profile.platform, backend) {
        return Ok(None);
    }
    let mut command = real_host_command(app)?;
    command.arg(MESSAGING_ONLY_ARG);
    Ok(Some((command, Some(host_keychain(app)))))
}

#[cfg(test)]
#[path = "agent_host_messaging_tests.rs"]
mod tests;
