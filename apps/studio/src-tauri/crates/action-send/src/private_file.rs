//! The records folder and its files kept private and never followed through
//! a link: the same checks as `run-store`'s `private_file.rs` and
//! `blob-store`'s folders. A record names private repositories and
//! accounts, and the port promises it is never written into another file.

use std::fs::{self, DirBuilder, File, Metadata, OpenOptions};
use std::io::{self, ErrorKind, Read};
use std::path::Path;

/// Why a records file or folder can't be used.
#[derive(Debug)]
pub(crate) enum FileRefusal {
    /// The entry is a link, a hard link or not a plain file or folder.
    Linked,
    /// The system refused to read or write it.
    Io(io::Error),
}

impl From<io::Error> for FileRefusal {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

/// Refuses a folder that is there but isn't a plain folder, such as a
/// symbolic link or a junction: making files in it would follow it.
pub(crate) fn refuse_linked_folder(folder: &Path) -> Result<(), FileRefusal> {
    match fs::symlink_metadata(folder) {
        Ok(entry) if !entry.file_type().is_dir() => Err(FileRefusal::Linked),
        Ok(_) => Ok(()),
        Err(error) if is_missing(&error) => Ok(()),
        Err(error) => Err(error.into()),
    }
}

/// Makes the folder and its parents, refusing a linked folder, and keeps
/// the folder readable by the user only on Unix, also when it was made
/// wider before. On Windows the mode means nothing; the profile folder's
/// own permissions protect the files there.
pub(crate) fn make_private_folder(folder: &Path) -> Result<(), FileRefusal> {
    refuse_linked_folder(folder)?;
    let mut builder = DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(folder)?;
    // Checked again: a link swapped in after the first look is refused
    // before its target's mode is changed.
    refuse_linked_folder(folder)?;
    #[cfg(unix)]
    fs::set_permissions(folder, std::os::unix::fs::PermissionsExt::from_mode(0o700))?;
    Ok(())
}

/// At most `limit` bytes of the file, or `None` when there is none. A link,
/// a hard link or anything but a plain file is refused, and checked again
/// on the open file, in case it was swapped in between.
pub(crate) fn read_unlinked(file: &Path, limit: u64) -> Result<Option<Vec<u8>>, FileRefusal> {
    let Some(entry) = checked_entry(file)? else {
        return Ok(None);
    };
    let opened = open_unfollowed(file, OpenOptions::new().read(true))?;
    refuse_unless_same(&entry, &opened.metadata()?)?;
    let mut bytes = Vec::new();
    opened.take(limit).read_to_end(&mut bytes)?;
    Ok(Some(bytes))
}

/// The opened file to append to, created readable by the user only, and its
/// size before the append, with the same refusals as [`read_unlinked`].
pub(crate) fn open_for_append(file: &Path) -> Result<(File, u64), FileRefusal> {
    let checked = checked_entry(file)?;
    let mut options = OpenOptions::new();
    options.append(true).create(true);
    let opened = open_unfollowed(file, &mut options)?;
    let metadata = opened.metadata()?;
    match &checked {
        Some(entry) => refuse_unless_same(entry, &metadata)?,
        // Created just now, or by another writer in between: either way a
        // plain file with one name.
        None if !is_plain_with_one_name(&metadata) => return Err(FileRefusal::Linked),
        None => {}
    }
    Ok((opened, metadata.len()))
}

/// Whether an error means "there is nothing at this path", also when a
/// folder on the way is a file.
pub(crate) fn is_missing(error: &io::Error) -> bool {
    matches!(error.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory)
}

/// Opens `file` with mode `600` for a file it creates, never following a
/// link: a link swapped in after [`checked_entry`] looked, or one put where
/// a record didn't exist yet, is refused by the open itself (`O_NOFOLLOW`),
/// so a create can't make the file the link points to. Nor does it wait
/// (`O_NONBLOCK`), so a named pipe swapped in is refused on the open file
/// rather than holding the records lock. On Windows a link is caught on the
/// open file only.
fn open_unfollowed(file: &Path, options: &mut OpenOptions) -> Result<File, FileRefusal> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    options.open(file).map_err(|error| {
        // `ELOOP`, or `EMLINK` on FreeBSD: the last part of the path is a link.
        #[cfg(unix)]
        if matches!(error.raw_os_error(), Some(libc::ELOOP | libc::EMLINK)) {
            return FileRefusal::Linked;
        }
        FileRefusal::Io(error)
    })
}

/// The entry as `symlink_metadata` gives it, `None` when there is none,
/// refusing anything but a plain file with one name. A named pipe is
/// refused here, before an open could wait on it.
fn checked_entry(file: &Path) -> Result<Option<Metadata>, FileRefusal> {
    match fs::symlink_metadata(file) {
        Ok(entry) if is_plain_with_one_name(&entry) => Ok(Some(entry)),
        Ok(_) => Err(FileRefusal::Linked),
        Err(error) if is_missing(&error) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// Refuses an open file that isn't the entry that was checked: on Unix,
/// another file or device; anywhere, no longer a plain file with one name.
fn refuse_unless_same(checked: &Metadata, opened: &Metadata) -> Result<(), FileRefusal> {
    #[cfg(unix)]
    let same = {
        use std::os::unix::fs::MetadataExt;
        checked.dev() == opened.dev() && checked.ino() == opened.ino()
    };
    #[cfg(not(unix))]
    let same = {
        let _ = checked;
        true
    };
    if same && is_plain_with_one_name(opened) {
        Ok(())
    } else {
        Err(FileRefusal::Linked)
    }
}

/// Whether an entry is a plain file with one name. A hard link is a second
/// name for a file that may sit in a workspace; the shell only appends to
/// its own records, so they always have one. Windows' count of names isn't
/// in the standard library, so there only links and other kinds of entry
/// are refused.
fn is_plain_with_one_name(entry: &Metadata) -> bool {
    #[cfg(unix)]
    let one_name = std::os::unix::fs::MetadataExt::nlink(entry) == 1;
    #[cfg(not(unix))]
    let one_name = true;
    entry.file_type().is_file() && one_name
}
