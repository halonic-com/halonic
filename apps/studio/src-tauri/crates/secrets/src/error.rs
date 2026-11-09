use std::fmt;

/// Why a keychain call failed. Each variant is one error `kind` the
/// commands return, the same on desktop and Android (agreed on HAL-229).
///
/// No message ever holds a secret's value. Only the canonical name may
/// appear, and only where the caller already knows it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SecretError {
    /// The name breaks the rule of the `Secrets` port.
    InvalidName,
    /// The value is empty, or longer than [`crate::MAX_VALUE_BYTES`] or than
    /// the backend can keep ([`crate::SecretBackend::max_value_bytes`]).
    InvalidValue,
    /// There is no keychain on this system, or it can't be reached.
    Unavailable,
    /// The user or the system refused access.
    Denied,
    /// A value is stored but can no longer be decrypted, for example after
    /// a backup is restored on a new Android device. The backend deletes
    /// it, so the app can ask for it again.
    Unreadable,
    /// Any other keychain failure, described without the value.
    Backend { message: String },
}

impl SecretError {
    /// The stable name the page sees as `kind`.
    pub fn kind(&self) -> &'static str {
        match self {
            SecretError::InvalidName => "invalid_name",
            SecretError::InvalidValue => "invalid_value",
            SecretError::Unavailable => "unavailable",
            SecretError::Denied => "denied",
            SecretError::Unreadable => "unreadable",
            SecretError::Backend { .. } => "backend",
        }
    }
}

impl fmt::Display for SecretError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SecretError::InvalidName => write!(
                formatter,
                "not a secret name: use a letter, then letters, digits, \"-\" or \"_\", at most 128 characters"
            ),
            SecretError::InvalidValue => {
                write!(
                    formatter,
                    "a secret's value must not be empty or longer than this keychain holds (16 KiB; 1,280 bytes on Windows)"
                )
            }
            SecretError::Unavailable => write!(formatter, "no keychain is available"),
            SecretError::Denied => write!(formatter, "access to the keychain was refused"),
            SecretError::Unreadable => {
                write!(
                    formatter,
                    "the stored secret can no longer be read; enter it again"
                )
            }
            SecretError::Backend { message } => write!(formatter, "the keychain failed: {message}"),
        }
    }
}

impl std::error::Error for SecretError {}
