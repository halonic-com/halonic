use std::fmt;

/// Why a device key call failed. No message ever holds key material.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeviceKeyError {
    /// The computer id breaks [`crate::ComputerId`]'s rule.
    InvalidComputer,
    /// The platform's key store can't be reached, or can't make its key.
    Unavailable,
    /// A key is stored for the computer but can't be opened: the file was
    /// changed or moved from another computer's, or the platform key that
    /// sealed it is gone. The phone has to pair with that computer again.
    Unreadable,
    /// Reading or writing the key's file failed, described without the key.
    Storage { message: String },
}

impl fmt::Display for DeviceKeyError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DeviceKeyError::InvalidComputer => write!(
                formatter,
                "not a computer id: use 1 to 64 letters, digits, \"-\" or \"_\""
            ),
            DeviceKeyError::Unavailable => {
                write!(formatter, "the phone's key store can't be reached")
            }
            DeviceKeyError::Unreadable => write!(
                formatter,
                "the key for this computer can no longer be opened; pair with it again"
            ),
            DeviceKeyError::Storage { message } => {
                write!(formatter, "the key file failed: {message}")
            }
        }
    }
}

impl std::error::Error for DeviceKeyError {}
