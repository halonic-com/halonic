//! The profile the CLI uses, found as `@halonicjs/profile` finds it, for the
//! commands that keep files in it: the trust records (`trust.rs`) and the
//! runs (`runs.rs`). One way of finding it, so the shell never writes to
//! another profile than the CLI's.

use halonic_profile::{Platform, ProfileEnvironment, ProfileFolder, profile_folder};
use tauri::{AppHandle, Manager, Runtime};

/// The CLI's profile folder, or why it can't be found, for the log.
pub fn cli_profile<R: Runtime>(app: &AppHandle<R>) -> Result<ProfileFolder, String> {
    let home = app
        .path()
        .home_dir()
        .ok()
        .and_then(|folder| folder.into_os_string().into_string().ok())
        .ok_or_else(|| "the home folder can't be found".to_owned())?;
    let environment = ProfileEnvironment {
        platform: Platform::current(),
        home_folder: home,
        halonic_home: variable("HALONIC_HOME")?,
        local_app_data: variable("LOCALAPPDATA")?,
        xdg_data_home: variable("XDG_DATA_HOME")?,
    };
    profile_folder(&environment).map_err(|error| error.to_string())
}

/// An environment variable, `None` when it isn't set. One that isn't
/// Unicode is refused, never skipped: skipping `HALONIC_HOME` would keep the
/// shell's files in another profile than the CLI's.
fn variable(name: &str) -> Result<Option<String>, String> {
    match std::env::var(name) {
        Ok(value) => Ok(Some(value)),
        Err(std::env::VarError::NotPresent) => Ok(None),
        Err(std::env::VarError::NotUnicode(_)) => Err(format!("{name} isn't valid Unicode")),
    }
}
