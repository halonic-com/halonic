//! The profile the CLI uses, found as `@halonicjs/profile` finds it, for the
//! commands that keep files in it: the trust records (`trust.rs`), the
//! host settings (`host_settings.rs`), the runs (`runs.rs`) and the shell's
//! log. One way of
//! finding it, so the shell never writes to another profile than the CLI's.
//!
//! A Studio started from Finder, the Dock or a desktop launcher doesn't get
//! the variables a shell rc file sets, so a variable the app wasn't started
//! with is read from the person's login shell instead (HAL-5545). Otherwise
//! `HALONIC_HOME` in `.zshrc` would give the CLI one profile and the Studio
//! another, and a folder trusted in one wouldn't be trusted in the other.

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::fmt;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use halonic_profile::{
    Platform, ProfileEnvironment, ProfileError, ProfileFolder, join_path, profile_folder,
};
use halonic_trust_grant::TrustRefusal;
use tauri::{AppHandle, Manager, Runtime};

/// Why the CLI's profile folder can't be found: the refusal kind a command
/// sends for it, and the message. A relative `HALONIC_HOME` is
/// `profile_setting`, a setting the person changes, so the page doesn't
/// take it for a file error (HAL-15963); anything else is `io`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileProblem {
    kind: &'static str,
    message: String,
}

impl ProfileProblem {
    /// The refusal kind: `profile_setting` or `io`.
    pub fn kind(&self) -> &'static str {
        self.kind
    }
}

impl fmt::Display for ProfileProblem {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl From<ProfileError> for ProfileProblem {
    fn from(error: ProfileError) -> Self {
        Self {
            kind: error.kind(),
            message: error.to_string(),
        }
    }
}

/// What [`cli_environment`] can't read is an `io` problem.
impl From<String> for ProfileProblem {
    fn from(message: String) -> Self {
        Self {
            kind: "io",
            message,
        }
    }
}

/// The trust commands' refusal (`trust.rs`, `instruction_trust.rs`); its
/// type lives in a crate that doesn't know the shell's profile.
impl From<ProfileProblem> for TrustRefusal {
    fn from(problem: ProfileProblem) -> Self {
        TrustRefusal::new(problem.kind(), problem.to_string())
    }
}

/// The CLI's profile folder, or why it can't be found.
pub fn cli_profile<R: Runtime>(app: &AppHandle<R>) -> Result<ProfileFolder, ProfileProblem> {
    Ok(profile_folder(&cli_environment(app)?)?)
}

/// What [`cli_profile`] finds the profile from: the home folder and the
/// variables, the app's own or the login shell's.
pub fn cli_environment<R: Runtime>(app: &AppHandle<R>) -> Result<ProfileEnvironment, String> {
    let home = app
        .path()
        .home_dir()
        .ok()
        .and_then(|folder| folder.into_os_string().into_string().ok())
        .ok_or_else(|| "the home folder can't be found".to_owned())?;
    Ok(ProfileEnvironment {
        platform: Platform::current(),
        home_folder: home,
        halonic_home: variable("HALONIC_HOME")?,
        local_app_data: variable("LOCALAPPDATA")?,
        xdg_data_home: variable("XDG_DATA_HOME")?,
    })
}

/// Names the shell's log, `studio/shell.log` in the CLI's profile, so what
/// the shell records reaches a file in a release build, which has no
/// console on Windows. Without a profile it records on stderr only.
pub fn start_shell_log<R: Runtime>(app: &AppHandle<R>) {
    match cli_profile(app) {
        Ok(profile) => halonic_shell_log::start(PathBuf::from(join_path(
            profile.platform,
            &profile.root,
            &["studio", halonic_shell_log::FILE_NAME],
        ))),
        Err(error) => halonic_shell_log::record(
            "profile",
            format!("no profile folder, so the shell's log stays on stderr: {error}"),
        ),
    }
}

/// The variables [`cli_profile`] reads.
const NAMES: [&str; 3] = ["HALONIC_HOME", "LOCALAPPDATA", "XDG_DATA_HOME"];

/// How long the login shell may take. One with a slow rc file is stopped,
/// and the app's own variables are used, as before HAL-5545.
const LOGIN_SHELL_WAIT: Duration = Duration::from_secs(5);

/// An environment variable, `None` when it isn't set: the app's own when it
/// was started with it, else the login shell's. One that isn't Unicode is
/// refused, never skipped: skipping `HALONIC_HOME` would keep the shell's
/// files in another profile than the CLI's.
fn variable(name: &str) -> Result<Option<String>, String> {
    let value = std::env::var_os(name).or_else(|| login_shell().get(name).cloned());
    value
        .map(|value| {
            value
                .into_string()
                .map_err(|_| format!("{name} isn't valid Unicode"))
        })
        .transpose()
}

/// The login shell's values of [`NAMES`], asked once per app run, and only
/// on macOS and Linux: Windows gives an app started from Explorer the
/// person's own variables already. A shell that can't be asked gives none,
/// and the reason goes to the log.
fn login_shell() -> &'static BTreeMap<String, OsString> {
    static VARIABLES: OnceLock<BTreeMap<String, OsString>> = OnceLock::new();
    VARIABLES.get_or_init(|| {
        if !cfg!(all(
            unix,
            not(target_os = "android"),
            not(target_os = "ios")
        )) || NAMES.iter().all(|name| std::env::var_os(name).is_some())
        {
            return BTreeMap::new();
        }
        let shell = std::env::var_os("SHELL")
            .filter(|shell| !shell.is_empty())
            .unwrap_or_else(|| default_shell().into());
        halonic_login_shell::login_variables(shell.as_ref(), &NAMES, LOGIN_SHELL_WAIT)
            .unwrap_or_else(|error| {
                halonic_shell_log::record(
                    "profile",
                    format!("the login shell's variables can't be read: {error}"),
                );
                BTreeMap::new()
            })
    })
}

/// The shell a terminal starts when `SHELL` isn't set.
fn default_shell() -> &'static str {
    if cfg!(target_os = "macos") {
        "/bin/zsh"
    } else {
        "/bin/sh"
    }
}

#[cfg(test)]
#[path = "profile_tests.rs"]
mod tests;
