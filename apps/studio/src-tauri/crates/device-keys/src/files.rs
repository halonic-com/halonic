//! The file steps both stores share: the key files and the paired
//! computers' details are written the same way, whole or not at all, and
//! readable by the app only.

use std::fs::{self, DirBuilder, OpenOptions};
use std::io::{Error, ErrorKind, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::error::DeviceKeyError;

/// Gives each temporary file of this process its own name.
static NEXT_TEMPORARY: AtomicU64 = AtomicU64::new(0);

/// The bytes of a plain file, `None` when nothing is there. A link or a
/// folder in its place is an error: the stores never write one.
pub(crate) fn read_plain_file(file: &Path) -> std::io::Result<Option<Vec<u8>>> {
    match fs::symlink_metadata(file) {
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
        Ok(metadata) if !metadata.is_file() => {
            Err(Error::new(ErrorKind::InvalidData, "not a plain file"))
        }
        Ok(_) => fs::read(file).map(Some),
    }
}

/// Writes `bytes` to a new temporary file in `folder`, then renames it over
/// `file`. The temporary file is removed again when a step fails.
pub(crate) fn replace_file(folder: &Path, file: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let serial = NEXT_TEMPORARY.fetch_add(1, Ordering::Relaxed);
    let temporary = folder.join(format!(".{}-{serial}.tmp", std::process::id()));
    let written = write_new_private(&temporary, bytes).and_then(|()| fs::rename(&temporary, file));
    if written.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    written
}

/// Removes a file; one that isn't there is already removed.
pub(crate) fn remove_file(file: &Path) -> std::io::Result<()> {
    match fs::remove_file(file) {
        Err(error) if error.kind() != ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

/// Makes `folder` and its parents, readable by the app only on Unix.
pub(crate) fn make_private_folder(folder: &Path) -> std::io::Result<()> {
    let mut builder = DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(folder)
}

fn write_new_private(file: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut opened = options.open(file)?;
    opened.write_all(bytes)?;
    opened.sync_all()
}

/// Turns an I/O error into [`DeviceKeyError::Storage`], naming the step.
pub(crate) fn storage(step: &'static str) -> impl Fn(Error) -> DeviceKeyError {
    move |error| DeviceKeyError::Storage {
        message: format!("{step}: {error}"),
    }
}
