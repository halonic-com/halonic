use std::fmt;
use std::path::PathBuf;

/// Why a trust store call failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TrustError {
    /// A record file exists but can't be read. `location` is the record's
    /// location when the store can tell it: the one asked for, or the one at
    /// the start of the file when its hash is the file's name. Otherwise
    /// only the file is known, and the person can delete it by hand.
    Unreadable {
        location: Option<String>,
        file: PathBuf,
    },
    /// The record given to `grant` is not an object with a text `location`.
    InvalidRecord,
    /// Reading the folder or writing a record failed.
    Io { message: String },
}

impl TrustError {
    /// A short, stable name for the error, for the page to pick its words.
    pub fn kind(&self) -> &'static str {
        match self {
            TrustError::Unreadable { .. } => "unreadable",
            TrustError::InvalidRecord => "invalid_record",
            TrustError::Io { .. } => "io",
        }
    }
}

impl From<std::io::Error> for TrustError {
    fn from(error: std::io::Error) -> Self {
        TrustError::Io {
            message: error.to_string(),
        }
    }
}

impl fmt::Display for TrustError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TrustError::Unreadable {
                location: Some(location),
                file,
            } => write!(
                formatter,
                "the trust record for {location:?} can't be read ({})",
                file.display()
            ),
            TrustError::Unreadable {
                location: None,
                file,
            } => write!(
                formatter,
                "the trust record in {} can't be read, nor which location it is for; delete the file to remove it",
                file.display()
            ),
            TrustError::InvalidRecord => {
                write!(
                    formatter,
                    "a trust record must be an object with a location"
                )
            }
            TrustError::Io { message } => {
                write!(
                    formatter,
                    "the trust records could not be read or written: {message}"
                )
            }
        }
    }
}

impl std::error::Error for TrustError {}
