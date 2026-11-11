//! The blob folders the Studio shell writes, in the same files as
//! `FolderBlobStore` in `fs-node`: each blob is the file
//! `<first two hex characters>/<hash>`, holding only the bytes, so no folder
//! holds more than a small share of them. A blob the desktop app stored is
//! there for the CLI, and the other way round.
//!
//! A put hashes the bytes itself, writes them to a temporary file in the
//! blob's own folder, flushes it and renames it into place, so the rename
//! stays on one disk and a reader sees the whole blob or none. Storing bytes
//! that are already there writes nothing. Folders are created readable by
//! their owner only (`700`), files likewise (`600`).
//!
//! A hash that isn't 64 lowercase hex characters never reaches a path. A
//! blob file that is a link, a hard link (on Unix) or not a plain file can't
//! be read, and a put replaces it rather than writing through it. A blob's
//! two-character folder that is a link or not a folder is refused by both.
//! Only these are checked, not the folders above: the blob folder must sit
//! in the profile, never in a workspace.
//!
//! Plain Rust with no Tauri types; the shell's `blob_*` commands wrap it.

pub mod base64url;
mod error;

use std::fs::{self, DirBuilder, File, Metadata, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub use error::BlobStoreError;

use sha2::{Digest, Sha256};

/// How many hex characters of the hash name a blob's folder.
const FOLDER_NAME_LENGTH: usize = 2;

/// Whether `hash` can name a blob: 64 lowercase hex characters, as
/// `isBlobHash` in `@halonicjs/ports` decides it.
pub fn is_blob_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// The lowercase hex SHA-256 of `bytes`: the blob's hash.
pub fn blob_hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// One blob folder: `<profile>/workspaces/<key>/blobs`. Created on the first put.
#[derive(Debug, Clone)]
pub struct BlobFolder {
    root: PathBuf,
}

impl BlobFolder {
    /// The blob folder `root`. A relative `root` is made absolute against
    /// the current folder now, as `resolve(root)` in `fs-node`.
    pub fn new(root: &Path) -> Result<Self, BlobStoreError> {
        Ok(Self {
            root: std::path::absolute(root)?,
        })
    }

    /// Where the blob folder is, always an absolute path.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Stores `bytes` and gives their hash. Bytes already stored, in a plain
    /// file with one name, are not written again.
    pub fn put(&self, bytes: &[u8]) -> Result<String, BlobStoreError> {
        let hash = blob_hash(bytes);
        let folder = self.folder_for(&hash);
        refuse_linked_folder(&folder)?;
        let file = folder.join(&hash);
        if !is_stored_blob(&file)? {
            create_private_folder(&self.root)?;
            create_private_folder(&folder)?;
            write_replacing(&file, bytes)?;
        }
        Ok(hash)
    }

    /// The bytes stored under `hash`, or `None` when there are none.
    pub fn get(&self, hash: &str) -> Result<Option<Vec<u8>>, BlobStoreError> {
        if !is_blob_hash(hash) {
            return Err(BlobStoreError::InvalidHash);
        }
        let folder = self.folder_for(hash);
        refuse_linked_folder(&folder)?;
        read_unlinked(&folder.join(hash))
    }

    fn folder_for(&self, hash: &str) -> PathBuf {
        self.root.join(&hash[..FOLDER_NAME_LENGTH])
    }
}

/// Refuses a blob's folder that is there but isn't a plain folder, such as
/// a symbolic link or a junction: creating and writing in it would follow
/// it to the folder it points to.
fn refuse_linked_folder(folder: &Path) -> Result<(), BlobStoreError> {
    match fs::symlink_metadata(folder) {
        Ok(entry) if !entry.file_type().is_dir() => Err(BlobStoreError::LinkedFolder {
            folder: folder.to_owned(),
        }),
        Ok(_) => Ok(()),
        Err(error) if is_missing(&error) => Ok(()),
        Err(error) => Err(error.into()),
    }
}

/// Whether `file` already holds a blob the store wrote: a plain file with
/// one name. A link or anything else in its place is replaced by the put.
fn is_stored_blob(file: &Path) -> Result<bool, BlobStoreError> {
    match fs::symlink_metadata(file) {
        Ok(entry) => Ok(is_plain_with_one_name(&entry)),
        Err(error) if is_missing(&error) => Ok(false),
        Err(error) => Err(error.into()),
    }
}

/// The bytes of `file`, `None` when there is none. A link, a hard link or
/// anything but a plain file is refused, and checked again on the open
/// file, in case it was swapped in between.
fn read_unlinked(file: &Path) -> Result<Option<Vec<u8>>, BlobStoreError> {
    let linked = || BlobStoreError::LinkedBlob {
        file: file.to_owned(),
    };
    let entry = match fs::symlink_metadata(file) {
        Ok(entry) => entry,
        Err(error) if is_missing(&error) => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if !is_plain_with_one_name(&entry) {
        return Err(linked());
    }
    let mut opened = File::open(file)?;
    if !is_same_file(&entry, &opened.metadata()?) {
        return Err(linked());
    }
    let mut bytes = Vec::new();
    opened.read_to_end(&mut bytes)?;
    Ok(Some(bytes))
}

/// Whether an entry, as `symlink_metadata` gives it, is a plain file with
/// one name. A hard link is a second name for a file that may sit in a
/// workspace; the store writes through a rename, so its own files always
/// have one. Windows' count of names isn't in the standard library, so
/// there only links and other kinds of entry are refused.
fn is_plain_with_one_name(entry: &Metadata) -> bool {
    #[cfg(unix)]
    let one_name = std::os::unix::fs::MetadataExt::nlink(entry) == 1;
    #[cfg(not(unix))]
    let one_name = true;
    entry.file_type().is_file() && one_name
}

/// Whether the open file is the entry that was checked: still a plain file
/// with one name and, on Unix, the same file on the same device.
fn is_same_file(checked: &Metadata, opened: &Metadata) -> bool {
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
    same && is_plain_with_one_name(opened)
}

/// Creates the folder, and any missing parents, readable by its owner only.
fn create_private_folder(folder: &Path) -> Result<(), BlobStoreError> {
    let mut builder = DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(folder)?;
    Ok(())
}

/// Writes `bytes` to a new temporary file next to `file`, flushes it, then
/// renames it over `file`, so a reader never sees half a blob and a link in
/// its place is replaced, not written through.
fn write_replacing(file: &Path, bytes: &[u8]) -> Result<(), BlobStoreError> {
    let temporary = temporary_for(file);
    let written = write_new(&temporary, bytes).and_then(|()| fs::rename(&temporary, file));
    if let Err(error) = written {
        // A half-written temporary file must not stay behind. If removing
        // it fails too, the write's own error is the one to report.
        let _ = fs::remove_file(&temporary);
        return Err(error.into());
    }
    Ok(())
}

/// Writes a file that must not exist yet, readable by its owner only, and
/// flushes it to disk before it is renamed into place.
fn write_new(file: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut created = options.open(file)?;
    created.write_all(bytes)?;
    created.sync_all()
}

/// A temporary file name next to `file` that no other write uses: the
/// process id, a count within the process and the time. It can't be a
/// blob's name, so nothing reads it if a crash leaves it behind.
fn temporary_for(file: &Path) -> PathBuf {
    static WRITES: AtomicU64 = AtomicU64::new(0);
    let count = WRITES.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_nanos());
    let mut name = file.file_name().unwrap_or_default().to_owned();
    name.push(format!(".{}-{count}-{nanos}.tmp", std::process::id()));
    file.with_file_name(name)
}

/// Whether an error means "there is nothing at this path", also when a
/// folder on the way is a file.
fn is_missing(error: &std::io::Error) -> bool {
    matches!(error.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory)
}
