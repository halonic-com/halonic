//! How much space a folder takes, with the standard library only.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// The total size, in bytes, of the files in `folder` and every folder in it.
///
/// - A folder that doesn't exist takes nothing: a profile has no data before
///   its first write.
/// - A symbolic link is never followed and takes nothing: a link out of the
///   folder would count another folder's files, and a link back in would
///   never end.
/// - A file that is removed while the folder is read is skipped, as the
///   folder is live. Any other failure is returned.
pub fn folder_size_bytes(folder: &Path) -> io::Result<u64> {
    let mut total: u64 = 0;
    let mut waiting: Vec<PathBuf> = vec![folder.to_path_buf()];
    while let Some(next) = waiting.pop() {
        let entries = match fs::read_dir(&next) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error),
        };
        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error),
            };
            // `DirEntry::metadata` doesn't follow a link either.
            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error),
            };
            if metadata.is_dir() {
                waiting.push(entry.path());
            } else if metadata.is_file() {
                total = total.saturating_add(metadata.len());
            }
        }
    }
    Ok(total)
}
