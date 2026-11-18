//! What names a file or folder on this computer, whatever name reached it:
//! letter case, a short 8.3 name, a `\\?\` prefix or a link. A folder
//! deleted and made again at the same path gets a new identity, so a check
//! by identity tells it apart from the one that was there.
//!
//! - Unix: the device and the inode.
//! - Windows: the volume serial number and the 128-bit file ID, from
//!   `GetFileInformationByHandleEx` with `FileIdInfo`. ReFS needs all 128
//!   bits: the 64-bit file index isn't unique there. Where that call isn't
//!   supported (FAT, some network shares), the 64-bit file index from
//!   `GetFileInformationByHandle`, which is all those systems have.

use std::io;
use std::path::Path;

/// The identity of a file or folder. Two names with the same identity reach
/// the same file or folder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct FileIdentity {
    /// The device on Unix, the volume serial number on Windows.
    pub volume: u64,
    /// The inode on Unix, the file ID on Windows. On NTFS the file ID is
    /// the 64-bit file index, so only ReFS uses the upper bits.
    pub index: u128,
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
            index: u128::from(metadata.ino()),
        })
    }
}

#[cfg(windows)]
mod platform {
    use super::FileIdentity;
    use std::fs::File;
    use std::io;
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use std::path::Path;
    use windows_sys::Win32::Foundation::{
        ERROR_INVALID_FUNCTION, ERROR_INVALID_PARAMETER, ERROR_NOT_SUPPORTED,
    };
    use windows_sys::Win32::Storage::FileSystem::{
        BY_HANDLE_FILE_INFORMATION, FILE_FLAG_BACKUP_SEMANTICS, FILE_ID_INFO, FileIdInfo,
        GetFileInformationByHandle, GetFileInformationByHandleEx,
    };

    /// The size `GetFileInformationByHandleEx` is told `FILE_ID_INFO` has:
    /// 24 bytes, so it fits.
    const FILE_ID_INFO_SIZE: u32 = size_of::<FILE_ID_INFO>() as u32;

    pub fn file_identity(path: &Path) -> io::Result<FileIdentity> {
        // No access asked for, only the name's identity. Backup semantics
        // opens a folder too; links are followed, so a link to the folder
        // is the folder.
        let file = std::fs::OpenOptions::new()
            .access_mode(0)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
            .open(path)?;
        match by_file_id(&file) {
            Err(error) if file_id_unsupported(&error) => by_file_index(&file),
            result => result,
        }
    }

    /// The volume serial number and the 128-bit file ID.
    fn by_file_id(file: &File) -> io::Result<FileIdentity> {
        let mut info = FILE_ID_INFO::default();
        // SAFETY: `file` is open for the call, and `info` outlives it and is
        // `FILE_ID_INFO_SIZE` bytes, the size of what `FileIdInfo` writes.
        let read = unsafe {
            GetFileInformationByHandleEx(
                file.as_raw_handle(),
                FileIdInfo,
                std::ptr::from_mut(&mut info).cast(),
                FILE_ID_INFO_SIZE,
            )
        };
        if read == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(FileIdentity {
            volume: info.VolumeSerialNumber,
            // Little-endian, as Windows keeps it: an NTFS file ID is its
            // 64-bit file index in the low bytes.
            index: u128::from_le_bytes(info.FileId.Identifier),
        })
    }

    /// The volume serial number and the 64-bit file index, for a file
    /// system that has no 128-bit file ID.
    fn by_file_index(file: &File) -> io::Result<FileIdentity> {
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        // SAFETY: `file` is open for the call, and `info` outlives it.
        if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(FileIdentity {
            volume: u64::from(info.dwVolumeSerialNumber),
            index: (u128::from(info.nFileIndexHigh) << 32) | u128::from(info.nFileIndexLow),
        })
    }

    /// Whether `error` says the file system has no 128-bit file ID, rather
    /// than that reading it failed. Any other error stays an error, so a
    /// ReFS folder never falls back to its 64-bit index.
    fn file_id_unsupported(error: &io::Error) -> bool {
        let unsupported = [
            ERROR_INVALID_FUNCTION,
            ERROR_INVALID_PARAMETER,
            ERROR_NOT_SUPPORTED,
        ];
        error
            .raw_os_error()
            .and_then(|code| u32::try_from(code).ok())
            .is_some_and(|code| unsupported.contains(&code))
    }

    /// The two Windows calls on a real folder. Requirement `file-identity`.
    #[cfg(test)]
    mod tests {
        use super::{by_file_id, by_file_index, file_id_unsupported};
        use std::io;
        use std::os::windows::fs::OpenOptionsExt;
        use windows_sys::Win32::Foundation::{
            ERROR_ACCESS_DENIED, ERROR_FILE_NOT_FOUND, ERROR_INVALID_FUNCTION,
            ERROR_INVALID_PARAMETER, ERROR_NOT_SUPPORTED,
        };
        use windows_sys::Win32::Storage::FileSystem::FILE_FLAG_BACKUP_SEMANTICS;

        fn os_error(code: u32) -> io::Error {
            io::Error::from_raw_os_error(i32::try_from(code).expect("a Windows error code"))
        }

        #[test]
        fn file_id_has_the_file_index_in_its_low_bits_on_ntfs() {
            // The temporary folder is on NTFS, where both calls work.
            let folder = std::fs::OpenOptions::new()
                .access_mode(0)
                .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
                .open(std::env::temp_dir())
                .expect("the temporary folder opens");
            let by_id = by_file_id(&folder).expect("NTFS has a 128-bit file ID");
            let by_index = by_file_index(&folder).expect("NTFS has a file index");
            assert_eq!(by_id.index, by_index.index);
            assert_eq!(by_id.index >> 64, 0, "NTFS leaves the upper bits clear");
        }

        #[test]
        fn file_id_falls_back_only_where_the_call_is_unsupported() {
            for code in [
                ERROR_INVALID_FUNCTION,
                ERROR_INVALID_PARAMETER,
                ERROR_NOT_SUPPORTED,
            ] {
                assert!(file_id_unsupported(&os_error(code)), "{code}");
            }
            for code in [ERROR_ACCESS_DENIED, ERROR_FILE_NOT_FOUND] {
                assert!(!file_id_unsupported(&os_error(code)), "{code}");
            }
            assert!(!file_id_unsupported(&io::Error::other(
                "not from the system"
            )));
        }
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
