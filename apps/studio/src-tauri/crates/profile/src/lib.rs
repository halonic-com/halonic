//! Finds the profile folder exactly as `profileFolder` in `@halonicjs/profile`
//! does (HAL-2612), so the Studio shell and the CLI share one profile, and
//! with it one folder of trust records (requirement `profile.trust-folder`)
//! and one folder of runs per workspace (`profile.workspace-folders`).
//!
//! Paths are plain text joined the platform's way, as in the TypeScript
//! package, so both can be checked against the same golden cases
//! (`packages/core/profile/src/golden/profile-folders.json` and
//! `workspace-folders.json`). The shell
//! turns the answer into a `PathBuf` only when it uses it.

mod native_path;
mod workspace_folders;

use std::fmt;

pub use native_path::{is_absolute_path, join_path, without_trailing_separators};
pub use workspace_folders::{WorkspaceError, WorkspaceFolders};

/// The name of the folder Halonic adds under the system's user data folder.
const FOLDER_NAME: &str = "halonic";

/// The name of the folder in the profile that holds the trust records.
const TRUST_FOLDER_NAME: &str = "trust";

/// The systems Halonic keeps a profile on. `Linux` covers every other
/// Unix-like system too.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Windows,
    Macos,
    Linux,
}

impl Platform {
    /// The system this build runs on.
    pub fn current() -> Self {
        if cfg!(windows) {
            Platform::Windows
        } else if cfg!(target_os = "macos") {
            Platform::Macos
        } else {
            Platform::Linux
        }
    }
}

/// What [`profile_folder`] reads from the system; the shell fills it in.
/// An empty variable counts as unset, as in the TypeScript package.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileEnvironment {
    pub platform: Platform,
    /// The person's home folder, absolute.
    pub home_folder: String,
    /// `HALONIC_HOME`: the profile folder itself, when the person set one.
    pub halonic_home: Option<String>,
    /// `LOCALAPPDATA`, read on Windows only.
    pub local_app_data: Option<String>,
    /// `XDG_DATA_HOME`, read on Linux only.
    pub xdg_data_home: Option<String>,
}

/// The profile folder, with the system its path belongs to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileFolder {
    pub platform: Platform,
    /// The folder, absolute, without a trailing separator. It may not exist yet.
    pub root: String,
}

/// Why the profile folder can't be found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProfileError {
    /// `HALONIC_HOME` is set but isn't absolute. It is refused, not resolved
    /// against the current folder, which would split the person's runs
    /// across many profiles.
    HalonicHomeNotAbsolute { value: String },
    /// The home folder isn't absolute.
    HomeNotAbsolute { value: String },
}

impl fmt::Display for ProfileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProfileError::HalonicHomeNotAbsolute { value } => {
                write!(
                    formatter,
                    "HALONIC_HOME must be an absolute folder, not {value:?}"
                )
            }
            ProfileError::HomeNotAbsolute { value } => {
                write!(formatter, "the home folder must be absolute, not {value:?}")
            }
        }
    }
}

impl std::error::Error for ProfileError {}

/// Finds the profile folder: `HALONIC_HOME` when it is set, or else the
/// `halonic` folder in the system's user data folder:
///
/// - Windows: `%LOCALAPPDATA%\halonic`, or `<home>\AppData\Local\halonic`
/// - macOS: `<home>/Library/Application Support/halonic`
/// - Linux: `$XDG_DATA_HOME/halonic`, or `<home>/.local/share/halonic`
///
/// A relative `XDG_DATA_HOME` or `LOCALAPPDATA` is ignored. Nothing is created.
pub fn profile_folder(environment: &ProfileEnvironment) -> Result<ProfileFolder, ProfileError> {
    let platform = environment.platform;
    if let Some(chosen) = set(&environment.halonic_home) {
        if !is_absolute_path(platform, chosen) {
            return Err(ProfileError::HalonicHomeNotAbsolute {
                value: chosen.to_owned(),
            });
        }
        let root = without_trailing_separators(platform, chosen);
        return Ok(ProfileFolder { platform, root });
    }
    let root = join_path(platform, &user_data_folder(environment)?, &[FOLDER_NAME]);
    Ok(ProfileFolder { platform, root })
}

impl ProfileFolder {
    /// The folder for the trust records, `trust` in the profile folder,
    /// as `trustFolder` in `@halonicjs/profile` names it. The CLI's
    /// `FileTrustStore` and the shell's trust store both keep their records
    /// there.
    pub fn trust_folder(&self) -> String {
        join_path(self.platform, &self.root, &[TRUST_FOLDER_NAME])
    }
}

/// The system's folder for a person's application data.
fn user_data_folder(environment: &ProfileEnvironment) -> Result<String, ProfileError> {
    let platform = environment.platform;
    let home = &environment.home_folder;
    if !is_absolute_path(platform, home) {
        return Err(ProfileError::HomeNotAbsolute {
            value: home.clone(),
        });
    }
    let (variable, fallback): (Option<&str>, &[&str]) = match platform {
        Platform::Windows => (set(&environment.local_app_data), &["AppData", "Local"]),
        Platform::Macos => (None, &["Library", "Application Support"]),
        Platform::Linux => (set(&environment.xdg_data_home), &[".local", "share"]),
    };
    if let Some(folder) = variable.filter(|folder| is_absolute_path(platform, folder)) {
        return Ok(folder.to_owned());
    }
    Ok(join_path(platform, home, fallback))
}

/// The variable's value, or `None` when it is unset or empty.
fn set(variable: &Option<String>) -> Option<&str> {
    variable.as_deref().filter(|value| !value.is_empty())
}
