//! Saving the person's sandbox choice (HAL-13319): the
//! `agent_host_sandbox_choice_save` command. The page names a backend, or
//! none to remove the choice; it never names a file or a folder. The shell
//! saves the choice in the Windows profile, and in the distro too when the
//! host there runs on it, then asks the host for the choice again
//! (`settings-changed`).
//!
//! The copy in the distro is written first: when it can't be, nothing is
//! saved and the command says so, so the two never name different backends
//! for the host that runs. A save that moves Studio to the other host stops
//! the one running; the next call starts the one the choice asks for.

use std::path::Path;

use halonic_agent_host::Answer;
use halonic_host_settings::{
    HostSettingsError, SandboxSetting, remove_sandbox_setting, save_sandbox_setting,
};
use halonic_run_lock::now_iso;
use tauri::{AppHandle, Manager, Runtime};

use super::choice::{HostKind, host_for, sandbox_folder};
use super::start::{chosen_host, copy_into_distro, distro_host_command_for_real_wsl};
use super::{AgentHostState, HostAnswer, HostRefusal, named_route, poisoned, read_answer, send};
use crate::profile::cli_profile;

/// The host's route that chooses again after the choice changed.
const SETTINGS_CHANGED: &str = "POST /v1/sandbox/choice/settings-changed";

/// Saves `backend` as the person's sandbox choice, or removes the choice
/// when it is `None`, and answers the host's `SandboxChoice` after it.
#[tauri::command]
pub async fn agent_host_sandbox_choice_save<R: Runtime>(
    app: AppHandle<R>,
    backend: Option<String>,
) -> Result<HostAnswer, HostRefusal> {
    let route = named_route(SETTINGS_CHANGED, Answer::Json)?;
    let saving = app.clone();
    tauri::async_runtime::spawn_blocking(move || save_choice(&saving, backend.as_deref()))
        .await
        .map_err(|error| HostRefusal::new("io", error))??;
    let response = send(&app, route, None).await?;
    read_answer(response).await
}

/// Saves the choice, holding the host so no host starts on half of it.
fn save_choice<R: Runtime>(app: &AppHandle<R>, backend: Option<&str>) -> Result<(), HostRefusal> {
    // An unknown backend is refused before anything is read or written.
    let setting = backend
        .map(|backend| {
            let version = app.package_info().version.to_string();
            SandboxSetting::new(backend, &now_iso(), &version)
        })
        .transpose()
        .map_err(settings_refusal)?;
    let state = app.state::<AgentHostState>();
    let mut host = state.host.lock().map_err(|_| poisoned())?;
    let profile = cli_profile(app).map_err(|error| HostRefusal::new("io", error))?;
    // A choice that can't be read counts as another host, so it is restarted.
    let before = chosen_host(app).ok().map(|(kind, _)| kind);
    let after = host_for(
        setting.as_ref().map(|setting| setting.backend()),
        profile.platform,
    );
    if after == HostKind::Distro {
        let (wsl, _) = distro_host_command_for_real_wsl()?;
        copy_into_distro(&wsl, setting.as_ref())?;
    }
    let folder = sandbox_folder(&profile);
    let folder = Path::new(&folder);
    match &setting {
        Some(setting) => save_sandbox_setting(folder, setting),
        None => remove_sandbox_setting(folder),
    }
    .map_err(settings_refusal)?;
    if moves_host(before, after) {
        drop(host.take());
        state.end_streams(|_| true);
    }
    Ok(())
}

/// Whether the running host must stop: the choice now asks for the other
/// one, or the host it ran on was unknown.
fn moves_host(before: Option<HostKind>, after: HostKind) -> bool {
    before != Some(after)
}

fn settings_refusal(error: HostSettingsError) -> HostRefusal {
    HostRefusal::new(error.kind(), error)
}

/// Requirement `sandbox-choice-save`: which saves stop the running host.
/// The refusal of an unknown backend is in `served_page_tests.rs`.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_host_stops_only_when_the_choice_moves_it() {
        assert!(!moves_host(Some(HostKind::Distro), HostKind::Distro));
        assert!(!moves_host(Some(HostKind::Local), HostKind::Local));
        assert!(moves_host(Some(HostKind::Distro), HostKind::Local));
        assert!(moves_host(Some(HostKind::Local), HostKind::Distro));
    }

    #[test]
    fn a_choice_that_couldnt_be_read_before_stops_the_host() {
        assert!(moves_host(None, HostKind::Local));
        assert!(moves_host(None, HostKind::Distro));
    }

    #[test]
    fn the_route_it_calls_is_in_the_hosts_table() {
        assert!(named_route(SETTINGS_CHANGED, Answer::Json).is_ok());
    }
}
