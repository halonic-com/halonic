use std::fmt;
use std::path::PathBuf;

/// Why a blob folder call failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BlobStoreError {
    /// The hash isn't 64 lowercase hex characters, so it can't name a file.
    InvalidHash,
    /// The blob's file is a link, a hard link or not a plain file.
    LinkedBlob { file: PathBuf },
    /// The blob's two-character folder is a link or not a folder.
    LinkedFolder { folder: PathBuf },
    /// Reading or writing a file failed.
    Io { message: String },
}

impl BlobStoreError {
    /// A short, stable name for the error, one of `blobRefusalKinds` in
    /// `packages/adapters/fs-tauri`, for the page to pick its words.
    pub fn kind(&self) -> &'static str {
        match self {
            BlobStoreError::InvalidHash => "invalid_hash",
            BlobStoreError::LinkedBlob { .. } | BlobStoreError::LinkedFolder { .. } => {
                "linked_blob"
            }
            BlobStoreError::Io { .. } => "io",
        }
    }
}

impl From<std::io::Error> for BlobStoreError {
    fn from(error: std::io::Error) -> Self {
        BlobStoreError::Io {
            message: error.to_string(),
        }
    }
}

/// The words of `FolderBlobStore` and the private-file helpers in `fs-node`,
/// so the page shows one message whichever side refused.
impl fmt::Display for BlobStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BlobStoreError::InvalidHash => {
                write!(formatter, "A blob's hash is 64 lowercase hex characters.")
            }
            BlobStoreError::LinkedBlob { file } => write!(
                formatter,
                "Blob file {:?} is a link or not a plain file: the store doesn't follow links.",
                file.display().to_string()
            ),
            BlobStoreError::LinkedFolder { folder } => write!(
                formatter,
                "Blob folder {:?} is a link or not a folder: the store doesn't follow links.",
                folder.display().to_string()
            ),
            BlobStoreError::Io { message } => write!(formatter, "{message}"),
        }
    }
}

impl std::error::Error for BlobStoreError {}
