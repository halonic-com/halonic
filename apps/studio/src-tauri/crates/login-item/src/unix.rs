//! Where this user's entry file lives on macOS and Linux.

use std::path::PathBuf;

use crate::LoginItemError;

/// macOS: `~/Library/LaunchAgents/com.halonic.studio.plist`.
#[cfg(target_os = "macos")]
pub fn usual_file() -> Result<PathBuf, LoginItemError> {
    let home = std::env::home_dir().ok_or(LoginItemError::UnsafePath)?;
    Ok(home
        .join("Library/LaunchAgents")
        .join(format!("{}.plist", crate::LAUNCH_AGENT_LABEL)))
}

/// Linux: `$XDG_CONFIG_HOME/autostart/halonic.desktop`, or under
/// `~/.config` when that isn't set to a full path, as the XDG spec says.
#[cfg(not(target_os = "macos"))]
pub fn usual_file() -> Result<PathBuf, LoginItemError> {
    let configured = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|folder| folder.is_absolute());
    let config = match configured {
        Some(folder) => folder,
        None => std::env::home_dir()
            .ok_or(LoginItemError::UnsafePath)?
            .join(".config"),
    };
    Ok(config.join("autostart").join("halonic.desktop"))
}
