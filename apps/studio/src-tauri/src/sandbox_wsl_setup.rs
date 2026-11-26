//! Settings › Agent sandbox's **Set up the sandbox** for Halonic's WSL
//! distro (HAL-16765): the shell runs the WSL setup from the Windows side,
//! as the host beside it started once with `--wsl-setup`. With no distro the
//! host in it can't start, so it can't be asked to set the distro up.
//!
//! The page names nothing: it calls `sandbox_wsl_setup` with no argument.
//! The shell picks the host beside the app, the profile folder, the image
//! beside the app and the app itself as the command that resumes the setup
//! after a restart. When the setup is done, the shell starts the host in the
//! new distro, which installs the runtime beside the app into it.

use serde::Serialize;
#[cfg(windows)]
use tauri::Manager;
use tauri::{AppHandle, Runtime};

use halonic_agent_host::WslSetupEnd;
#[cfg(windows)]
use halonic_agent_host::{WslSetupRun, WslSetupRuns};

/// How the setup ended, for the page.
// Only Windows runs the setup; elsewhere the command refuses.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum WslSetupAnswer {
    /// The distro is set up and the host started in it.
    Done,
    /// Windows must restart before the setup can go on.
    RestartNeeded,
    /// The person turned Windows' prompt down, or closed it.
    Cancelled,
    /// The setup, or the host's start after it, failed. `reason` is a code of
    /// the sandbox port's list, `code` the setup's own when it gave one;
    /// `details` is for **Copy details** only.
    Failed {
        reason: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<String>,
        details: String,
    },
    /// The setup still ran after five minutes; it is left to finish.
    TimedOut,
    /// A setup started earlier still runs, so no other started.
    StillRunning,
    /// The distro's image isn't beside the app, so nothing started.
    ImageMissing,
    /// The host beside the app didn't start, and why.
    NotStarted { details: String },
    /// The setup ended without saying how, with its exit code if it had one.
    Unanswered {
        #[serde(rename = "exitCode", skip_serializing_if = "Option::is_none")]
        exit_code: Option<i32>,
    },
}

/// How long the shell waits for the setup, as for `sandbox_elevate` and the
/// section's own limit (`SETUP_LIMIT_MINUTES`): change them together.
#[cfg(windows)]
const LIMIT: std::time::Duration = std::time::Duration::from_secs(5 * 60);

/// The one run of the setup at a time, on Windows.
#[cfg(windows)]
#[derive(Default)]
pub struct WslSetupState(WslSetupRuns);

/// Whether the page offers the WSL setup: on Windows, when the host the
/// shell starts runs in Halonic's distro, as it does with no saved choice or
/// with `srt-wsl`.
#[tauri::command]
pub async fn sandbox_wsl_setup_offered<R: Runtime>(app: AppHandle<R>) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        cfg!(windows) && crate::agent_host::host_runs_in_distro(&app)
    })
    .await
    .unwrap_or(false)
}

/// Runs the WSL setup and waits at most five minutes for it; once it is
/// done, starts the host in the distro. Windows only, and only where the
/// host runs in the distro.
#[tauri::command]
pub async fn sandbox_wsl_setup<R: Runtime>(app: AppHandle<R>) -> Result<WslSetupAnswer, String> {
    #[cfg(windows)]
    {
        let run_app = app.clone();
        let answer = tauri::async_runtime::spawn_blocking(move || run_setup(&run_app))
            .await
            .map_err(|error| error.to_string())??;
        if answer != WslSetupAnswer::Done {
            return Ok(answer);
        }
        Ok(
            match crate::agent_host::start_host_after_setup(&app).await {
                Ok(()) => WslSetupAnswer::Done,
                Err((reason, message)) => host_refused(reason, message),
            },
        )
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("only Windows has a WSL setup".to_owned())
    }
}

/// Runs the setup with the shell's own arguments, or answers why it can't.
#[cfg(windows)]
fn run_setup<R: Runtime>(app: &AppHandle<R>) -> Result<WslSetupAnswer, String> {
    use std::path::Path;

    use halonic_agent_host::{WSL_IMAGE, executable_beside, resume_command, wsl_setup_command};

    if !crate::agent_host::host_runs_in_distro(app) {
        return Err("the sandbox choice doesn't use Halonic's WSL distro".to_owned());
    }
    let profile = crate::profile::cli_profile(app).map_err(|problem| problem.to_string())?;
    let shell = std::env::current_exe()
        .map_err(|error| format!("the app's folder isn't known: {error}"))?;
    let image = shell.with_file_name(WSL_IMAGE);
    // Until the installer ships the image (HAL-16765 PR 3), this is where a
    // build without it stops, before anything runs.
    if !image.is_file() {
        return Ok(WslSetupAnswer::ImageMissing);
    }
    let host = executable_beside(&shell).map_err(|error| error.to_string())?;
    let command = wsl_setup_command(
        &host,
        Path::new(&profile.root),
        &image,
        &resume_command(&shell),
    );
    Ok(answer_of(
        app.state::<WslSetupState>().0.run(command, LIMIT),
    ))
}

/// The page's answer for a run.
#[cfg(windows)]
fn answer_of(run: WslSetupRun) -> WslSetupAnswer {
    match run {
        WslSetupRun::Ended(end) => answer_of_end(end),
        WslSetupRun::TimedOut => WslSetupAnswer::TimedOut,
        WslSetupRun::StillRunning => WslSetupAnswer::StillRunning,
        WslSetupRun::NotStarted(details) => WslSetupAnswer::NotStarted { details },
        WslSetupRun::Unreadable(exit_code) => WslSetupAnswer::Unanswered { exit_code },
    }
}

/// The page's answer for how the setup said it ended.
#[cfg_attr(not(windows), allow(dead_code))]
fn answer_of_end(end: WslSetupEnd) -> WslSetupAnswer {
    match end {
        WslSetupEnd::Done => WslSetupAnswer::Done,
        WslSetupEnd::RestartNeeded => WslSetupAnswer::RestartNeeded,
        WslSetupEnd::Cancelled => WslSetupAnswer::Cancelled,
        WslSetupEnd::Blocked { reason, detail } => WslSetupAnswer::Failed {
            reason,
            code: None,
            details: detail,
        },
        WslSetupEnd::Failed {
            reason,
            code,
            detail,
        } => WslSetupAnswer::Failed {
            reason,
            code: Some(code),
            details: detail,
        },
        // Neither is the person's to fix: the page offers Copy details.
        WslSetupEnd::Refused { code, detail } => WslSetupAnswer::Failed {
            reason: "other".to_owned(),
            code: Some(code),
            details: detail,
        },
        WslSetupEnd::Error { detail } => WslSetupAnswer::Failed {
            reason: "other".to_owned(),
            code: Some("error".to_owned()),
            details: detail,
        },
    }
}

/// The answer when the host didn't start in the new distro: its sandbox
/// reason, such as `runtime-missing`, or `other`.
#[cfg_attr(not(windows), allow(dead_code))]
fn host_refused(reason: Option<&'static str>, message: String) -> WslSetupAnswer {
    WslSetupAnswer::Failed {
        reason: reason.unwrap_or("other").to_owned(),
        code: None,
        details: message,
    }
}

#[cfg(test)]
mod tests {
    use halonic_agent_host::WslSetupEnd;
    use serde_json::{Value, json};

    use super::{WslSetupAnswer, answer_of_end, host_refused};

    #[test]
    fn sandbox_wsl_setup_command_answers_each_ending() {
        let cases = [
            (WslSetupEnd::Done, json!({"outcome": "done"})),
            (
                WslSetupEnd::RestartNeeded,
                json!({"outcome": "restart_needed"}),
            ),
            (WslSetupEnd::Cancelled, json!({"outcome": "cancelled"})),
            (
                WslSetupEnd::Blocked {
                    reason: "virtualisation-off".to_owned(),
                    detail: "d".to_owned(),
                },
                json!({"outcome": "failed", "reason": "virtualisation-off", "details": "d"}),
            ),
            (
                WslSetupEnd::Failed {
                    reason: "other".to_owned(),
                    code: "distro-not-ours".to_owned(),
                    detail: "d".to_owned(),
                },
                json!({"outcome": "failed", "reason": "other", "code": "distro-not-ours", "details": "d"}),
            ),
            (
                WslSetupEnd::Refused {
                    code: "bad-flags".to_owned(),
                    detail: "d".to_owned(),
                },
                json!({"outcome": "failed", "reason": "other", "code": "bad-flags", "details": "d"}),
            ),
            (
                WslSetupEnd::Error {
                    detail: "d".to_owned(),
                },
                json!({"outcome": "failed", "reason": "other", "code": "error", "details": "d"}),
            ),
        ];
        for (end, expected) in cases {
            assert_eq!(serde_json::to_value(answer_of_end(end)).unwrap(), expected);
        }
    }

    #[test]
    fn sandbox_wsl_setup_command_answers_the_shells_own_endings() {
        for (answer, expected) in [
            (WslSetupAnswer::TimedOut, json!({"outcome": "timed_out"})),
            (
                WslSetupAnswer::StillRunning,
                json!({"outcome": "still_running"}),
            ),
            (
                WslSetupAnswer::ImageMissing,
                json!({"outcome": "image_missing"}),
            ),
            (
                WslSetupAnswer::NotStarted {
                    details: "no".to_owned(),
                },
                json!({"outcome": "not_started", "details": "no"}),
            ),
            (
                WslSetupAnswer::Unanswered { exit_code: Some(3) },
                json!({"outcome": "unanswered", "exitCode": 3}),
            ),
            (
                WslSetupAnswer::Unanswered { exit_code: None },
                json!({"outcome": "unanswered"}),
            ),
        ] {
            assert_eq!(serde_json::to_value(answer).unwrap(), expected);
        }
    }

    #[test]
    fn sandbox_wsl_setup_command_says_why_the_host_didnt_start_after_it() {
        assert_eq!(
            serde_json::to_value(host_refused(Some("runtime-missing"), "m".to_owned())).unwrap(),
            json!({"outcome": "failed", "reason": "runtime-missing", "details": "m"})
        );
        assert_eq!(
            serde_json::to_value(host_refused(None, "m".to_owned())).unwrap(),
            json!({"outcome": "failed", "reason": "other", "details": "m"})
        );
    }

    #[test]
    fn sandbox_wsl_setup_command_is_granted_to_the_local_main_window_only() {
        // A remote page, the Studio the computer serves, must never start a
        // setup that imports a distro and installs WSL.
        let text = include_str!("../capabilities/desktop-sandbox-wsl-setup.json");
        let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
        assert_eq!(capability["local"], true);
        assert_eq!(capability["windows"], json!(["main", "inbox", "messenger"]));
        assert!(capability.get("remote").is_none(), "{capability}");
        assert!(capability.get("webviews").is_none(), "{capability}");
        assert_eq!(capability["platforms"], json!(["windows"]));
        assert_eq!(
            capability["permissions"],
            json!(["allow-sandbox-wsl-setup-offered", "allow-sandbox-wsl-setup"])
        );
    }
}
