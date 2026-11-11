//! Reading the settings file without following a link, as
//! `readUnlinkedFile` in `fs-node` does, so the settings can't live in a
//! file an agent may edit, such as one in its workspace.

use std::fs::{File, Metadata, OpenOptions};
use std::io::{self, Read};
use std::path::Path;

/// Why [`read_unlinked`] read nothing.
#[derive(Debug)]
pub(crate) enum ReadFailure {
    /// There is no file, or a file sits where a folder should be.
    Missing,
    /// The entry is a link, a hard link or not a plain file; the reason is
    /// for the message.
    Refused(&'static str),
    /// The system refused to read it.
    Io(io::Error),
}

/// The file's bytes, refusing a symbolic link (on Windows a junction too),
/// a hard link and anything but a plain file.
///
/// The open itself refuses to follow a link, so nothing can swap one in
/// between a look and the open: `O_NOFOLLOW` on Unix, and on Windows
/// `FILE_FLAG_OPEN_REPARSE_POINT`, which opens the link rather than what it
/// points to. On Unix the open doesn't wait either (`O_NONBLOCK`), so a
/// named pipe put there is refused rather than holding the shell's settings
/// lock forever. The open file is then checked: a hard link is refused on
/// Unix only, because Windows' standard library doesn't give a file's link
/// count yet. Only the file itself is checked; the settings folder must sit
/// in the profile.
pub(crate) fn read_unlinked(file: &Path) -> Result<Vec<u8>, ReadFailure> {
    let mut opened = open_unlinked(file).map_err(failure)?;
    let found = opened.metadata().map_err(ReadFailure::Io)?;
    refuse_unless_plain(&found)?;
    let mut bytes = Vec::new();
    opened.read_to_end(&mut bytes).map_err(ReadFailure::Io)?;
    Ok(bytes)
}

#[cfg(unix)]
fn open_unlinked(file: &Path) -> io::Result<File> {
    use std::os::unix::fs::OpenOptionsExt;
    OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(file)
}

#[cfg(windows)]
fn open_unlinked(file: &Path) -> io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    /// Opens a link itself rather than what it points to (`winbase.h`).
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    /// Lets a folder or a junction open too, so it is refused as not a
    /// plain file and a save replaces it, as on Unix.
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
    OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS)
        .open(file)
}

/// Refuses a link, anything but a plain file and, on Unix, a file with
/// another name.
fn refuse_unless_plain(entry: &Metadata) -> Result<(), ReadFailure> {
    if entry.file_type().is_symlink() {
        return Err(ReadFailure::Refused("it is a link"));
    }
    if !entry.is_file() {
        return Err(ReadFailure::Refused("it isn't a plain file"));
    }
    #[cfg(unix)]
    {
        if std::os::unix::fs::MetadataExt::nlink(entry) > 1 {
            return Err(ReadFailure::Refused("it is a hard link"));
        }
    }
    Ok(())
}

/// `Missing` for "there is nothing at this path", as `isMissing` in
/// `fs-node` reads `ENOENT` and `ENOTDIR`; `Refused` for the link
/// `O_NOFOLLOW` wouldn't open (`ELOOP`, or `EMLINK` on FreeBSD); `Io` for
/// anything else.
fn failure(error: io::Error) -> ReadFailure {
    if matches!(
        error.kind(),
        io::ErrorKind::NotFound | io::ErrorKind::NotADirectory
    ) {
        return ReadFailure::Missing;
    }
    #[cfg(unix)]
    {
        if matches!(error.raw_os_error(), Some(libc::ELOOP | libc::EMLINK)) {
            return ReadFailure::Refused("it is a link");
        }
    }
    ReadFailure::Io(error)
}
