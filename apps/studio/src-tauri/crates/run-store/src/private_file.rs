//! The run folder's files kept private and never followed through a link,
//! as `private-files.ts` in `fs-node` keeps them
//! (`fs-node.run-store-private-files`): logs and snapshots hold prompts,
//! tool results and model output. The same checks as `record-store`'s log
//! files.

use std::fs::{DirBuilder, File, Metadata, OpenOptions};
use std::io::{self, ErrorKind, Read, Write};
use std::path::Path;

/// Why a file of the run folder can't be used.
#[derive(Debug)]
pub(crate) enum FileRefusal {
    /// The entry is a link, a hard link or not a plain file.
    Linked,
    /// The system refused to read or write it.
    Io(io::Error),
}

impl From<io::Error> for FileRefusal {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

/// Creates the folder, and any missing parents, readable by its owner only,
/// and makes a folder made earlier private too: the mode applies only to a
/// folder the call creates. On Windows the mode means nothing; the profile
/// folder's own permissions protect the files there.
pub(crate) fn make_private_folder(folder: &Path) -> io::Result<()> {
    let mut builder = DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(folder)?;
    #[cfg(unix)]
    std::fs::set_permissions(folder, std::os::unix::fs::PermissionsExt::from_mode(0o700))?;
    Ok(())
}

/// The file's bytes, or `None` when there is none. A link, a hard link or
/// anything but a plain file is refused, and checked again on the open
/// file, in case it was swapped in between.
pub(crate) fn read_unlinked(file: &Path) -> Result<Option<Vec<u8>>, FileRefusal> {
    let Some(entry) = checked_entry(file)? else {
        return Ok(None);
    };
    let mut opened = File::open(file)?;
    refuse_unless_same(&entry, &opened.metadata()?)?;
    let mut bytes = Vec::new();
    opened.read_to_end(&mut bytes)?;
    Ok(Some(bytes))
}

/// Opens the log at `file` to append, creating it readable by its owner
/// only, with the same refusals as [`read_unlinked`].
pub(crate) fn open_for_append(file: &Path) -> Result<File, FileRefusal> {
    let mut options = OpenOptions::new();
    options.append(true).create(true);
    open_checked(file, &mut options)
}

/// Opens the existing log at `file` to cut it shorter, with the same
/// refusals as [`read_unlinked`]. It is opened to write but not to append:
/// on Windows a file opened to append can't be cut shorter (HAL-4361).
pub(crate) fn open_for_cut(file: &Path) -> Result<File, FileRefusal> {
    let mut options = OpenOptions::new();
    options.write(true);
    open_checked(file, &mut options)
}

/// Creates `file`, readable by its owner only, writes `text` into it and
/// flushes it to disk. Fails when the file is there already, so it never
/// writes through a link someone put in its place.
pub(crate) fn write_new_private(file: &Path, text: &str) -> io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut created = options.open(file)?;
    created.write_all(text.as_bytes())?;
    created.sync_all()
}

/// Whether an error means "there is nothing at this path", also when a
/// folder on the way is a file.
pub(crate) fn is_missing(error: &io::Error) -> bool {
    matches!(error.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory)
}

fn open_checked(file: &Path, options: &mut OpenOptions) -> Result<File, FileRefusal> {
    let checked = checked_entry(file)?;
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(options, 0o600);
    let opened = options.open(file)?;
    let metadata = opened.metadata()?;
    match &checked {
        Some(entry) => refuse_unless_same(entry, &metadata)?,
        // Created just now, or by another writer in between: either way a
        // plain file with one name.
        None if !is_plain_with_one_name(&metadata) => return Err(FileRefusal::Linked),
        None => {}
    }
    Ok(opened)
}

/// The entry as `symlink_metadata` gives it, `None` when there is none,
/// refusing anything but a plain file with one name. A named pipe is
/// refused here, before an open could wait on it.
fn checked_entry(file: &Path) -> Result<Option<Metadata>, FileRefusal> {
    match std::fs::symlink_metadata(file) {
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
/// name for a file that may sit in a workspace; the store writes through a
/// rename or an append, so its own files always have one. Windows' count of
/// names isn't in the standard library, so there only links and other kinds
/// of entry are refused.
fn is_plain_with_one_name(entry: &Metadata) -> bool {
    #[cfg(unix)]
    let one_name = std::os::unix::fs::MetadataExt::nlink(entry) == 1;
    #[cfg(not(unix))]
    let one_name = true;
    entry.file_type().is_file() && one_name
}
