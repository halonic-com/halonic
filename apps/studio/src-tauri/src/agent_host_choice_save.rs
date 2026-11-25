//! Saving the person's sandbox choice (HAL-13319): the
//! `agent_host_sandbox_choice_save` command. The page names a backend, or
//! none to remove the choice; it never names a file or a folder. The shell
//! saves the choice in the Windows profile, and in the distro too when the
//! host there runs on it, then asks the host for the choice again
//! (`settings-changed`).
//!
//! The copy in the distro is written first: when it can't be, nothing is
//! saved and the command says so, so the two never name different backends
//! for the host that runs. When the profile then can't be written, the
//! distro's copy is put back to the choice before. A save that moves Studio to the other host stops
//! the one running; the next call starts the one the choice asks for.
//!
//! Before it saves `none`, the shell asks the person itself, in a native
//! dialog (HAL-16342): the page asks too, but a page could send the choice
//! without asking, and `none` is the only choice that drops the fence. When
//! the person doesn't say yes, nothing is saved and the page gets the
//! host's choice as it was.

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
use crate::native_dialogs::ask_to_continue_without_sandbox;
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
    tauri::async_runtime::spawn_blocking(move || {
        let version = saving.package_info().version.to_string();
        let asked = asked_choice(backend.as_deref(), &now_iso(), &version, || {
            ask_to_continue_without_sandbox(&saving)
        })?;
        match asked {
            Asked::Save(setting) => save_choice(&saving, setting),
            Asked::Declined => Ok(()),
        }
    })
    .await
    .map_err(|error| HostRefusal::new("io", error))??;
    let response = send(&app, route, None).await?;
    read_answer(response).await
}

/// What a save does once the person was asked, where they had to be.
#[derive(Debug)]
enum Asked {
    /// Save this choice, or remove the choice when `None`.
    Save(Option<SandboxSetting>),
    /// The person didn't say yes to `none`: nothing is saved.
    Declined,
}

/// The choice the page sent, after `ask` when it is `none`. An unknown
/// backend is refused before anyone is asked or anything is read or
/// written. The question waits outside the host's lock, so the host keeps
/// answering while the dialog is open.
fn asked_choice(
    backend: Option<&str>,
    chosen_at: &str,
    version: &str,
    ask: impl FnOnce() -> bool,
) -> Result<Asked, HostRefusal> {
    let setting = backend
        .map(|backend| SandboxSetting::new(backend, chosen_at, version))
        .transpose()
        .map_err(settings_refusal)?;
    let drops_the_fence = setting
        .as_ref()
        .is_some_and(|setting| setting.backend() == "none");
    if drops_the_fence && !ask() {
        return Ok(Asked::Declined);
    }
    Ok(Asked::Save(setting))
}

/// Saves the choice, holding the host so no host starts on half of it.
fn save_choice<R: Runtime>(
    app: &AppHandle<R>,
    setting: Option<SandboxSetting>,
) -> Result<(), HostRefusal> {
    let state = app.state::<AgentHostState>();
    let mut host = state.host.lock().map_err(|_| poisoned())?;
    let profile = cli_profile(app).map_err(HostRefusal::from)?;
    // A choice that can't be read counts as another host, so it is restarted.
    let before = chosen_host(app).ok();
    let after = host_for(
        setting.as_ref().map(|setting| setting.backend()),
        profile.platform,
    );
    let copied_into = if after == HostKind::Distro {
        let (wsl, _) = distro_host_command_for_real_wsl()?;
        copy_into_distro(&wsl, setting.as_ref())?;
        Some(wsl)
    } else {
        None
    };
    let folder = sandbox_folder(&profile);
    let folder = Path::new(&folder);
    let saved = match &setting {
        Some(setting) => save_sandbox_setting(folder, setting),
        None => remove_sandbox_setting(folder),
    }
    .map_err(settings_refusal);
    // The copy goes back to the choice the profile still holds. When that
    // choice couldn't be read, the copy stays: the next start refuses on the
    // unreadable choice anyway.
    let put_back = copied_into
        .zip(before.as_ref())
        .map(|(wsl, (_, previous))| move || copy_into_distro(&wsl, previous.as_ref()));
    put_copy_back_when_unsaved(saved, put_back)?;
    if moves_host(before.map(|(kind, _)| kind), after) {
        drop(host.take());
        // Whether a messaging host runs beside the shell follows where the host runs.
        drop(state.messaging_host.lock().map_err(|_| poisoned())?.take());
        state.streams.end(|_| true);
        // The engines forget the old host's address and token.
        #[cfg(desktop)]
        crate::engines::sandbox_host_changed(app, None);
    }
    Ok(())
}

/// When the profile couldn't be saved after the distro's copy was made,
/// puts the copy back with `put_back` (HAL-14510), so the distro's copy
/// isn't one choice ahead of the profile until the next start. The refusal
/// is the profile's; a copy that can't be put back adds its own message, so
/// neither error is lost.
fn put_copy_back_when_unsaved<PutBack>(
    saved: Result<(), HostRefusal>,
    put_back: Option<PutBack>,
) -> Result<(), HostRefusal>
where
    PutBack: FnOnce() -> Result<(), HostRefusal>,
{
    let Err(mut refusal) = saved else {
        return Ok(());
    };
    let Some(put_back) = put_back else {
        return Err(refusal);
    };
    if let Err(put_back_refusal) = put_back() {
        refusal.message = format!(
            "{}; and the distro's copy couldn't be put back: {}",
            refusal.message, put_back_refusal.message
        );
    }
    Err(refusal)
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
/// Requirement `sandbox-choice-save-put-back`: the distro's copy is put back
/// when the profile can't be saved. Requirement `sandbox-choice-save-asks`:
/// `none` is saved only after the person's yes in the shell's own dialog.
#[cfg(test)]
mod tests {
    use super::*;

    const CHOSEN_AT: &str = "2026-11-22T18:00:00.000Z";

    /// `asked_choice` for `backend`, answering the question `yes`, and
    /// whether it was asked.
    fn asked(backend: Option<&str>, yes: bool) -> (Result<Asked, HostRefusal>, bool) {
        let mut was_asked = false;
        let answer = asked_choice(backend, CHOSEN_AT, "0.1.2", || {
            was_asked = true;
            yes
        });
        (answer, was_asked)
    }

    #[test]
    fn no_sandbox_is_not_saved_without_the_persons_yes() {
        let (answer, was_asked) = asked(Some("none"), false);
        assert!(was_asked);
        assert!(matches!(answer, Ok(Asked::Declined)));
    }

    #[test]
    fn no_sandbox_is_saved_after_the_persons_yes() {
        let (answer, was_asked) = asked(Some("none"), true);
        assert!(was_asked);
        let Ok(Asked::Save(Some(setting))) = answer else {
            panic!("the choice is saved: {answer:?}");
        };
        assert_eq!(setting.backend(), "none");
    }

    #[test]
    fn a_sandbox_or_no_choice_is_saved_without_asking() {
        for backend in ["srt", "srt-wsl", "mxc", "docker-sbx", "cloud"] {
            let (answer, was_asked) = asked(Some(backend), false);
            assert!(!was_asked, "{backend} isn't asked");
            let Ok(Asked::Save(Some(setting))) = answer else {
                panic!("{backend} is saved: {answer:?}");
            };
            assert_eq!(setting.backend(), backend);
        }
        let (answer, was_asked) = asked(None, false);
        assert!(!was_asked);
        assert!(matches!(answer, Ok(Asked::Save(None))));
    }

    #[test]
    fn an_unknown_backend_is_refused_before_anyone_is_asked() {
        let (answer, was_asked) = asked(Some("docker"), true);
        assert!(!was_asked);
        assert_eq!(answer.expect_err("refused").kind, "invalid_choice");
    }

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

    /// A put-back that counts its calls and answers `answer`.
    fn put_back_counting(
        calls: &std::cell::Cell<u32>,
        answer: Result<(), HostRefusal>,
    ) -> Option<impl FnOnce() -> Result<(), HostRefusal> + '_> {
        Some(move || {
            calls.set(calls.get() + 1);
            answer
        })
    }

    #[test]
    fn a_saved_profile_leaves_the_distros_copy() {
        let calls = std::cell::Cell::new(0);
        let result = put_copy_back_when_unsaved(Ok(()), put_back_counting(&calls, Ok(())));
        assert!(result.is_ok());
        assert_eq!(calls.get(), 0);
    }

    #[test]
    fn an_unsaved_profile_puts_the_distros_copy_back_and_refuses() {
        let calls = std::cell::Cell::new(0);
        let unsaved = Err(HostRefusal::new("io", "the profile is read-only"));
        let refusal = put_copy_back_when_unsaved(unsaved, put_back_counting(&calls, Ok(())))
            .expect_err("the save is refused");
        assert_eq!(calls.get(), 1);
        assert_eq!(refusal.kind, "io");
        assert_eq!(refusal.message, "the profile is read-only");
    }

    #[test]
    fn a_copy_that_cant_be_put_back_keeps_both_messages() {
        let calls = std::cell::Cell::new(0);
        let unsaved = Err(HostRefusal::new("io", "the profile is read-only"));
        let stuck = Err(HostRefusal::new("host_unavailable", "wsl.exe failed"));
        let refusal = put_copy_back_when_unsaved(unsaved, put_back_counting(&calls, stuck))
            .expect_err("the save is refused");
        assert_eq!(calls.get(), 1);
        assert_eq!(refusal.kind, "io");
        assert_eq!(
            refusal.message,
            "the profile is read-only; and the distro's copy couldn't be put back: wsl.exe failed"
        );
    }

    #[test]
    fn without_a_copy_to_put_back_the_refusal_is_the_profiles() {
        let unsaved = Err(HostRefusal::new("io", "the profile is read-only"));
        let no_put_back: Option<fn() -> Result<(), HostRefusal>> = None;
        let refusal = put_copy_back_when_unsaved(unsaved, no_put_back).expect_err("refused");
        assert_eq!(refusal.message, "the profile is read-only");
    }

    #[test]
    fn the_route_it_calls_is_in_the_hosts_table() {
        assert!(named_route(SETTINGS_CHANGED, Answer::Json).is_ok());
    }
}
