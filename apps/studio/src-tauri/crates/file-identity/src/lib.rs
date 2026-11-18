//! What names a file or folder on this computer, whatever name reached it:
//! letter case, a short 8.3 name, a `\\?\` prefix or a link. A folder
//! deleted and made again at the same path gets a new identity, so a check
//! by identity tells it apart from the one that was there.
//!
//! - Unix: the device and the inode.
//! - Windows: the volume serial number and the file index, from
//!   `GetFileInformationByHandle`.

use std::io;
use std::path::Path;

/// The identity of a file or folder. Two names with the same identity reach
/// the same file or folder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct FileIdentity {
    /// The device on Unix, the volume serial number on Windows.
    pub volume: u64,
    /// The inode on Unix, the file index on Windows.
    pub index: u64,
}

/// The identity of the file or folder at `path`. A link is followed, so a
/// link to a folder has the folder's identity.
///
/// # Errors
///
/// When nothing is at `path`, it can't be opened, or the system gives no
/// identity.
pub fn file_identity(path: &Path) -> io::Result<FileIdentity> {
    platform::file_identity(path)
}

#[cfg(unix)]
mod platform {
    use super::FileIdentity;
    use std::io;
    use std::os::unix::fs::MetadataExt;
    use std::path::Path;

    pub fn file_identity(path: &Path) -> io::Result<FileIdentity> {
        let metadata = std::fs::metadata(path)?;
        Ok(FileIdentity {
            volume: metadata.dev(),
            index: metadata.ino(),
        })
    }
}

#[cfg(windows)]
mod platform {
    use super::FileIdentity;
    use std::io;
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use std::path::Path;
    use windows_sys::Win32::Storage::FileSystem::{
        BY_HANDLE_FILE_INFORMATION, FILE_FLAG_BACKUP_SEMANTICS, GetFileInformationByHandle,
    };

    pub fn file_identity(path: &Path) -> io::Result<FileIdentity> {
        // No access asked for, only the name's identity. Backup semantics
        // opens a folder too; links are followed, so a link to the folder
        // is the folder.
        let file = std::fs::OpenOptions::new()
            .access_mode(0)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
            .open(path)?;
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        // SAFETY: `file` is open for the call, and `info` outlives it.
        if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(FileIdentity {
            volume: u64::from(info.dwVolumeSerialNumber),
            index: (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow),
        })
    }
}

#[cfg(not(any(unix, windows)))]
mod platform {
    use super::FileIdentity;
    use std::io;
    use std::path::Path;

    pub fn file_identity(_path: &Path) -> io::Result<FileIdentity> {
        Err(io::ErrorKind::Unsupported.into())
    }
}
