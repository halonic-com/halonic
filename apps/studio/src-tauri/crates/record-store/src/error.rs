use std::fmt;
use std::path::PathBuf;

/// Why a record folder call failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecordStoreError {
    /// The lines to write aren't whole, non-empty lines of JSON changes to
    /// the collection, each ending in a line break.
    InvalidLines { collection: String },
    /// One append names the collection twice; the page sends each once.
    RepeatedCollection { collection: String },
    /// The log's whole lines aren't UTF-8 text.
    BrokenLog { file: PathBuf },
    /// The log is a link, a hard link or not a plain file.
    LinkedLog { file: PathBuf },
    /// Reading or writing a file, or taking the write lock, failed.
    Io { message: String },
}

impl RecordStoreError {
    /// A short, stable name for the error, one of `recordRefusalKinds` in
    /// `packages/adapters/fs-tauri`, for the page to pick its words.
    pub fn kind(&self) -> &'static str {
        match self {
            RecordStoreError::InvalidLines { .. } | RecordStoreError::RepeatedCollection { .. } => {
                "invalid_lines"
            }
            RecordStoreError::BrokenLog { .. } => "broken_log",
            RecordStoreError::LinkedLog { .. } => "linked_log",
            RecordStoreError::Io { .. } => "io",
        }
    }
}

impl From<std::io::Error> for RecordStoreError {
    fn from(error: std::io::Error) -> Self {
        RecordStoreError::Io {
            message: error.to_string(),
        }
    }
}

/// The words of `FileRecordStore` and the private-file helpers in `fs-node`,
/// so the page shows one message whichever side refused.
impl fmt::Display for RecordStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RecordStoreError::InvalidLines { collection } => write!(
                formatter,
                "The lines to append to {collection:?} must be whole lines of changes to it, each ending in a line break."
            ),
            RecordStoreError::RepeatedCollection { collection } => write!(
                formatter,
                "The lines to append to {collection:?} must come in one part, not several."
            ),
            RecordStoreError::BrokenLog { file } => write!(
                formatter,
                "Broken record log {:?}: it is not valid UTF-8 text.",
                file.display().to_string()
            ),
            RecordStoreError::LinkedLog { file } => write!(
                formatter,
                "Record log {:?} is a link or not a plain file: the store doesn't follow links.",
                file.display().to_string()
            ),
            RecordStoreError::Io { message } => write!(formatter, "{message}"),
        }
    }
}

impl std::error::Error for RecordStoreError {}
