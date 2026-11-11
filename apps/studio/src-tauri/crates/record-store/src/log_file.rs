//! A collection's log on disk: one JSON change per line, each ending in a
//! line break. This side only finds the whole lines and keeps the file
//! safe; the page reads the lines into changes with `parseRecordLines` from
//! the `RecordStore` port.

use std::fs::{self, File, Metadata, OpenOptions};
use std::io::{ErrorKind, Read, Seek, SeekFrom, Write};
use std::path::Path;

use crate::error::RecordStoreError;

const LINE_BREAK: u8 = b'\n';

/// Where `bytes`' whole lines end: just after the last line break, or 0.
pub(crate) fn intact_end(bytes: &[u8]) -> usize {
    bytes
        .iter()
        .rposition(|&byte| byte == LINE_BREAK)
        .map_or(0, |last| last + 1)
}

/// Where the whole lines of the log at `file`, `size` bytes long, end: its
/// size when it ends in a line break or is empty, which is the usual case
/// and needs one byte read; otherwise just after its last line break.
pub(crate) fn intact_size(file: &Path, size: u64) -> Result<u64, RecordStoreError> {
    if size == 0 {
        return Ok(0);
    }
    let mut last = [0_u8; 1];
    let mut opened = File::open(file)?;
    opened.seek(SeekFrom::Start(size - 1))?;
    opened.read_exact(&mut last)?;
    if last[0] == LINE_BREAK {
        return Ok(size);
    }
    Ok(intact_end(&read_log(file)?) as u64)
}

/// The bytes of the log at `file`, empty when there is none. A link, a hard
/// link or anything but a plain file is refused, and checked again on the
/// open file, in case it was swapped in between.
pub(crate) fn read_log(file: &Path) -> Result<Vec<u8>, RecordStoreError> {
    let Some(entry) = checked_entry(file)? else {
        return Ok(Vec::new());
    };
    let mut opened = File::open(file)?;
    refuse_unless_same(file, &entry, &opened.metadata()?)?;
    let mut bytes = Vec::new();
    opened.read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// Opens the log at `file` to append, creating it readable by its owner
/// only, with the same refusals as [`read_log`]. Gives the handle and the
/// log's size.
pub(crate) fn open_for_append(file: &Path) -> Result<(File, u64), RecordStoreError> {
    let checked = checked_entry(file)?;
    let mut options = OpenOptions::new();
    options.append(true).create(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let opened = options.open(file)?;
    let metadata = opened.metadata()?;
    match &checked {
        Some(entry) => refuse_unless_same(file, entry, &metadata)?,
        // Created just now, or by another writer in between: either way a plain file with one name.
        None if !is_plain_with_one_name(&metadata) => return Err(linked(file)),
        None => {}
    }
    Ok((opened, metadata.len()))
}

/// Cuts the log back to `size` bytes: a torn line before an append, or a
/// failed append's lines. It opens the log again rather than cutting
/// through the append's handle: on Windows a file opened to append can't
/// be cut shorter (HAL-4361).
pub(crate) fn cut_back(file: &Path, size: u64) -> std::io::Result<()> {
    OpenOptions::new().write(true).open(file)?.set_len(size)
}

/// Writes all of `lines` at the end of the log and flushes them to disk
/// before the append reports success (HAL-5215).
pub(crate) fn write_lines(log: &mut File, lines: &str) -> std::io::Result<()> {
    log.write_all(lines.as_bytes())?;
    log.sync_data()
}

/// Replaces the log with `text` in one step: a new private file, flushed to
/// disk, renamed over the old one, so a crash leaves the old log or the new.
pub(crate) fn replace_file(file: &Path, temporary: &Path, text: &str) -> std::io::Result<()> {
    let written = write_new(temporary, text).and_then(|()| fs::rename(temporary, file));
    if written.is_err() {
        // A half-written temporary file must not stay behind. If removing
        // it fails too, the write's own error is the one to report.
        let _ = fs::remove_file(temporary);
    }
    written
}

/// Removes the log; a log that is already gone is fine.
pub(crate) fn remove_log(file: &Path) -> std::io::Result<()> {
    match fs::remove_file(file) {
        Err(error) if is_missing(&error) => Ok(()),
        removed => removed,
    }
}

fn write_new(file: &Path, text: &str) -> std::io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut created = options.open(file)?;
    created.write_all(text.as_bytes())?;
    created.sync_all()
}

/// The log's entry as `symlink_metadata` gives it, `None` when there is
/// none, refusing anything but a plain file with one name. A named pipe is
/// refused here, before an open could wait on it.
fn checked_entry(file: &Path) -> Result<Option<Metadata>, RecordStoreError> {
    match fs::symlink_metadata(file) {
        Ok(entry) if is_plain_with_one_name(&entry) => Ok(Some(entry)),
        Ok(_) => Err(linked(file)),
        Err(error) if is_missing(&error) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// Refuses an open file that isn't the entry that was checked: on Unix,
/// another file or device; anywhere, no longer a plain file with one name.
fn refuse_unless_same(
    file: &Path,
    checked: &Metadata,
    opened: &Metadata,
) -> Result<(), RecordStoreError> {
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
        Err(linked(file))
    }
}

/// Whether an entry is a plain file with one name. A hard link is a second
/// name for a file that may sit in a workspace; the store writes through a
/// rename or an append, so its own logs always have one. Windows' count of
/// names isn't in the standard library, so there only links and other kinds
/// of entry are refused.
fn is_plain_with_one_name(entry: &Metadata) -> bool {
    #[cfg(unix)]
    let one_name = std::os::unix::fs::MetadataExt::nlink(entry) == 1;
    #[cfg(not(unix))]
    let one_name = true;
    entry.file_type().is_file() && one_name
}

fn linked(file: &Path) -> RecordStoreError {
    RecordStoreError::LinkedLog {
        file: file.to_owned(),
    }
}

/// Whether an error means "there is nothing at this path", also when a
/// folder on the way is a file.
pub(crate) fn is_missing(error: &std::io::Error) -> bool {
    matches!(error.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory)
}
