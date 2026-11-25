//! Halonic's login item (B1 step 6, HAL-14221; D9 of the HAL-14206 design
//! note with the HAL-14212 security review's changes). One per-user entry
//! starts the installed Halonic with exactly `--background` when the user
//! logs in:
//!
//! - Windows: the value `Halonic` under `HKCU\…\CurrentVersion\Run`, the
//!   path in double quotes. Never `HKLM`: the entry is this user's only.
//! - macOS: the LaunchAgent `~/Library/LaunchAgents/com.halonic.studio.plist`.
//! - Linux: the XDG autostart file `~/.config/autostart/halonic.desktop`.
//!
//! It is written here rather than with `tauri-plugin-autostart`: that
//! plugin's `auto-launch` writes the path unquoted on Windows and Linux and
//! tries the machine-wide `HKLM` key first on Windows, which the security
//! review rules out, and this needs no new third-party code.
//!
//! Only turning it on checks where Halonic runs from (`installed`); turning
//! it off always works, so a moved copy can still remove its entry.

mod entry;
mod installed;
#[cfg(not(windows))]
mod unix;
#[cfg(windows)]
mod windows;

use std::fmt;
use std::path::{Path, PathBuf};

pub use entry::{desktop_entry, launch_agent, run_value};
pub use installed::{in_applications, in_install_location, in_system_folder};

/// The one argument a login start passes, fixed here so no caller picks it.
pub const BACKGROUND_ARGUMENT: &str = "--background";

/// The entry's name: the `Run` value on Windows, the LaunchAgent's label.
pub const ENTRY_NAME: &str = "Halonic";

/// The LaunchAgent's label on macOS: the app's identifier.
pub const LAUNCH_AGENT_LABEL: &str = "com.halonic.studio";

/// Why the login item couldn't change. None of them holds a path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LoginItemError {
    /// Halonic doesn't run from where it was installed, so it may not add
    /// itself to the login items.
    NotInstalled,
    /// The executable's path can't be written safely into an entry: not
    /// absolute, not Unicode, or holding a control character or `"`.
    UnsafePath,
    /// The system refused, with its own words (no path in them).
    Failed(String),
}

impl fmt::Display for LoginItemError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotInstalled => {
                formatter.write_str("Halonic doesn't run from where it was installed")
            }
            Self::UnsafePath => {
                formatter.write_str("Halonic's path can't be written into a login item")
            }
            Self::Failed(reason) => write!(formatter, "the login item couldn't change: {reason}"),
        }
    }
}

/// Where this user's entry lives. The tests point it at their own value name
/// or folder, so they never touch the real one.
#[derive(Debug, Clone)]
pub enum Place {
    /// Windows: a value of this name under `HKCU\…\CurrentVersion\Run`.
    RunValue(String),
    /// macOS and Linux: this file, a LaunchAgent plist or a `.desktop` file.
    File(PathBuf),
}

/// One user's login item for one Halonic executable.
#[derive(Debug, Clone)]
pub struct LoginItem {
    executable: PathBuf,
    place: Place,
}

impl LoginItem {
    /// The login item for `executable` at `place`.
    pub fn at(executable: PathBuf, place: Place) -> Self {
        Self { executable, place }
    }

    /// The login item of the running Halonic, at this user's usual place.
    /// On macOS and Linux the path is resolved, so a link or `..` can't pass
    /// the installed check; Windows' own path is kept, as resolving it there
    /// gives a `\\?\` path the `Run` key and the install folder don't use.
    pub fn for_this_halonic() -> Result<Self, LoginItemError> {
        let failed = |error: std::io::Error| LoginItemError::Failed(error.kind().to_string());
        let executable = std::env::current_exe().map_err(failed)?;
        #[cfg(not(windows))]
        let executable = executable.canonicalize().map_err(failed)?;
        Ok(Self::at(executable, usual_place()?))
    }

    /// Whether the entry is there.
    pub fn is_on(&self) -> Result<bool, LoginItemError> {
        self.entry().map(|entry| entry.is_some())
    }

    /// What the entry holds now: the `Run` value's data or the file's text,
    /// `None` when there is none.
    pub fn entry(&self) -> Result<Option<String>, LoginItemError> {
        match &self.place {
            #[cfg(windows)]
            Place::RunValue(name) => windows::run_value(name),
            Place::File(file) => match std::fs::read_to_string(file) {
                Ok(text) => Ok(Some(text)),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(error) => Err(LoginItemError::Failed(error.kind().to_string())),
            },
            #[cfg(not(windows))]
            Place::RunValue(_) => Ok(None),
        }
    }

    /// Writes the entry, or rewrites it with this executable's path, when
    /// `installed` says Halonic runs from where it was installed.
    pub fn turn_on(&self, installed: bool) -> Result<(), LoginItemError> {
        if !installed {
            return Err(LoginItemError::NotInstalled);
        }
        match &self.place {
            #[cfg(windows)]
            Place::RunValue(name) => windows::set_run_value(name, &run_value(&self.executable)?),
            Place::File(file) => write_file(file, &self.file_text(file)?),
            #[cfg(not(windows))]
            Place::RunValue(_) => Err(LoginItemError::Failed("no registry here".to_owned())),
        }
    }

    /// Removes the entry. An entry that isn't there is already off.
    pub fn turn_off(&self) -> Result<(), LoginItemError> {
        match &self.place {
            #[cfg(windows)]
            Place::RunValue(name) => windows::remove_run_value(name),
            Place::File(file) => match std::fs::remove_file(file) {
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                    Err(LoginItemError::Failed(error.kind().to_string()))
                }
                _ => Ok(()),
            },
            #[cfg(not(windows))]
            Place::RunValue(_) => Ok(()),
        }
    }

    /// Whether the running Halonic is the installed one, by this system's
    /// rule in `installed`.
    pub fn is_installed(&self) -> bool {
        #[cfg(windows)]
        let installed = windows::install_location(ENTRY_NAME)
            .is_some_and(|folder| in_install_location(&self.executable, &folder));
        #[cfg(target_os = "macos")]
        let installed = in_applications(&self.executable, std::env::home_dir().as_deref());
        #[cfg(all(not(windows), not(target_os = "macos")))]
        let installed = in_system_folder(&self.executable);
        installed
    }

    fn file_text(&self, file: &Path) -> Result<String, LoginItemError> {
        if file
            .extension()
            .is_some_and(|extension| extension == "plist")
        {
            return launch_agent(LAUNCH_AGENT_LABEL, &self.executable);
        }
        desktop_entry(&self.executable)
    }
}

#[cfg(windows)]
fn usual_place() -> Result<Place, LoginItemError> {
    Ok(Place::RunValue(ENTRY_NAME.to_owned()))
}

#[cfg(not(windows))]
fn usual_place() -> Result<Place, LoginItemError> {
    unix::usual_file().map(Place::File)
}

fn write_file(file: &Path, text: &str) -> Result<(), LoginItemError> {
    let failed = |error: std::io::Error| LoginItemError::Failed(error.kind().to_string());
    if let Some(folder) = file.parent() {
        std::fs::create_dir_all(folder).map_err(failed)?;
    }
    std::fs::write(file, text).map_err(failed)
}
