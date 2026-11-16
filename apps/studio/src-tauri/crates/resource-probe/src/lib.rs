//! The numbers behind the status bar's resources item (HAL-11118): how much
//! memory this app uses, how much space is free on a drive, and how much
//! space a folder takes. The standard library can answer only the last one,
//! so the first two call the operating system. Nothing unsafe leaves this
//! crate: callers get plain numbers.

mod folder_size;

#[cfg(unix)]
mod unix;
#[cfg(unix)]
use unix as os;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
use windows as os;

use std::io;
use std::path::Path;

pub use folder_size::folder_size_bytes;

/// The memory this process holds in RAM, in bytes: the resident set on Unix
/// and Android, the working set on Windows.
///
/// It is this process only. A child process, such as a web view's, is not
/// counted.
pub fn process_memory_bytes() -> io::Result<u64> {
    os::process_memory_bytes()
}

/// The free space, in bytes, on the drive that holds `folder`, as far as the
/// person running this process may use it (not the space only an
/// administrator may use).
///
/// `folder` may not exist yet, as a profile folder may not before its first
/// write: the nearest folder above it that exists names the drive.
pub fn free_disk_bytes(folder: &Path) -> io::Result<u64> {
    os::free_disk_bytes(nearest_existing(folder))
}

/// `folder`, or the nearest of its parents that exists.
fn nearest_existing(folder: &Path) -> &Path {
    folder
        .ancestors()
        .find(|candidate| candidate.exists())
        .unwrap_or(folder)
}
