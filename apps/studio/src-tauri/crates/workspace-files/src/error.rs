use std::fmt;

/// Why a file call was refused or failed. [`Self::kind`] is the stable name
/// the page picks its words by, one of `fileRefusalKinds` in
/// `packages/adapters/fs-tauri`. Messages name workspace paths only, never
/// where the workspace is on the computer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileError {
    /// The path is absolute, has a `.`, `..` or empty segment, or a
    /// backslash or NUL.
    UnsafePath { path: String, reason: &'static str },
    /// The path has a private segment (see `is_private_workspace_path`).
    PrivatePath { path: String },
    /// A segment of the path is a symbolic link or a junction.
    LinkedPath { path: String },
    /// A folder under the workspace can't be read. `path` is its workspace
    /// path, `""` for the workspace itself.
    FolderUnreadable { path: String, message: String },
    /// The file's bytes aren't UTF-8.
    NotText { path: String },
    /// Anything else the file system said.
    Io { message: String },
}

impl FileError {
    /// The stable name of the refusal. A linked path is a private one to
    /// the page: the store doesn't serve it.
    pub fn kind(&self) -> &'static str {
        match self {
            Self::UnsafePath { .. } => "unsafe_path",
            Self::PrivatePath { .. } | Self::LinkedPath { .. } => "private_path",
            Self::FolderUnreadable { .. } => "folder_unreadable",
            Self::NotText { .. } => "not_text",
            Self::Io { .. } => "io",
        }
    }

    /// The unreadable folder's workspace path, for `folder_unreadable` only.
    pub fn folder(&self) -> Option<&str> {
        match self {
            Self::FolderUnreadable { path, .. } => Some(path),
            _ => None,
        }
    }

    /// An error of the file system, while working on the workspace path
    /// `path`.
    pub(crate) fn io(path: &str, error: &std::io::Error) -> Self {
        Self::Io {
            message: format!("{path:?}: {error}"),
        }
    }
}

impl fmt::Display for FileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsafePath { path, reason } => {
                write!(formatter, "Unsafe workspace path {path:?}: {reason}.")
            }
            Self::PrivatePath { path } => write!(
                formatter,
                "Private workspace path {path:?}: the store doesn't serve it."
            ),
            Self::LinkedPath { path } => write!(
                formatter,
                "Linked workspace path {path:?}: the store doesn't follow links."
            ),
            Self::FolderUnreadable { path, message } => {
                write!(
                    formatter,
                    "The workspace folder {path:?} can't be read: {message}"
                )
            }
            Self::NotText { path } => write!(formatter, "{path:?} isn't UTF-8 text."),
            Self::Io { message } => formatter.write_str(message),
        }
    }
}

impl std::error::Error for FileError {}
