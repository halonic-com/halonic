//! Reading the settings file without following a link, as
//! `readUnlinkedFile` in `fs-node` does, so the settings can't live in a
//! file an agent may edit, such as one in its workspace.

use std::fs::{self, File, Metadata};
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

/// How often a read starts again when the file was replaced between the
/// look and the open. A save renames a new file over the old one, so the
/// next try finds a settled file.
const TRIES: usize = 3;

/// The file's bytes, refusing a symbolic link (on Windows a junction too), a
/// hard link and anything but a plain file.
///
/// It looks with `symlink_metadata` first, then opens the file and checks
/// the open file again. Rust's standard library has no `O_NOFOLLOW`, so on
/// Unix the open file must be the one it looked at (same device and inode):
/// a link put there in between is refused. On Windows the open file is
/// only checked to be a plain file, and a hard link can't be told, because
/// the standard library doesn't give a file's link count there yet. Only
/// the file itself is checked; the settings folder must sit in the profile.
pub(crate) fn read_unlinked(file: &Path) -> Result<Vec<u8>, ReadFailure> {
    let mut tries = 0;
    loop {
        tries += 1;
        let looked = fs::symlink_metadata(file).map_err(failure)?;
        if looked.file_type().is_symlink() {
            return Err(ReadFailure::Refused("it is a link"));
        }
        refuse_unless_plain(&looked)?;
        let mut opened = File::open(file).map_err(failure)?;
        let found = opened.metadata().map_err(ReadFailure::Io)?;
        if !same_file(&looked, &found) {
            if tries < TRIES {
                continue;
            }
            return Err(ReadFailure::Refused("it changed while it was read"));
        }
        refuse_unless_plain(&found)?;
        let mut bytes = Vec::new();
        opened.read_to_end(&mut bytes).map_err(ReadFailure::Io)?;
        return Ok(bytes);
    }
}

/// Refuses anything but a plain file with no other name. A file with no
/// name at all passes: a save that renamed over it after the open leaves
/// the open file with none, and no workspace can reach it then.
fn refuse_unless_plain(entry: &Metadata) -> Result<(), ReadFailure> {
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

/// Whether two looks are at the same file. Only Unix can tell.
#[cfg(unix)]
fn same_file(left: &Metadata, right: &Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    left.dev() == right.dev() && left.ino() == right.ino()
}

#[cfg(not(unix))]
fn same_file(_left: &Metadata, _right: &Metadata) -> bool {
    true
}

/// `Missing` for "there is nothing at this path", as `isMissing` in
/// `fs-node` reads `ENOENT` and `ENOTDIR`; `Io` for anything else.
fn failure(error: io::Error) -> ReadFailure {
    match error.kind() {
        io::ErrorKind::NotFound | io::ErrorKind::NotADirectory => ReadFailure::Missing,
        _ => ReadFailure::Io(error),
    }
}
