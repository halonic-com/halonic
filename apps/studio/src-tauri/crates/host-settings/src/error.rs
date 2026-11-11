use std::fmt;
use std::path::PathBuf;

/// Why a host settings call failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostSettingsError {
    /// The key isn't one `is_host_setting_key` allows. Nothing was saved.
    InvalidKey { key: String },
    /// The values would be over `MAX_BYTES` with this key. Nothing was saved.
    TooLarge { key: String },
    /// The settings file exists but can't be read: it is a link, a hard
    /// link or not a plain file, or the system refused to read it.
    Unreadable { file: PathBuf, reason: String },
    /// Creating the folder or writing the file failed.
    Io { message: String },
}

impl HostSettingsError {
    /// A short, stable name for the error, for the page to pick its words:
    /// one of `hostSettingsRefusalKinds` in `packages/adapters/fs-tauri`.
    pub fn kind(&self) -> &'static str {
        match self {
            HostSettingsError::InvalidKey { .. } => "invalid_key",
            HostSettingsError::TooLarge { .. } => "too_large",
            HostSettingsError::Unreadable { .. } => "unreadable",
            HostSettingsError::Io { .. } => "io",
        }
    }
}

impl From<std::io::Error> for HostSettingsError {
    fn from(error: std::io::Error) -> Self {
        HostSettingsError::Io {
            message: error.to_string(),
        }
    }
}

impl fmt::Display for HostSettingsError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HostSettingsError::InvalidKey { key } => {
                write!(formatter, "{key:?} can't name a setting")
            }
            HostSettingsError::TooLarge { key } => write!(
                formatter,
                "the settings would be over {} bytes with {key}",
                crate::MAX_BYTES
            ),
            HostSettingsError::Unreadable { file, reason } => write!(
                formatter,
                "the settings in {} can't be read: {reason}",
                file.display()
            ),
            HostSettingsError::Io { message } => {
                write!(formatter, "the settings could not be saved: {message}")
            }
        }
    }
}

impl std::error::Error for HostSettingsError {}
