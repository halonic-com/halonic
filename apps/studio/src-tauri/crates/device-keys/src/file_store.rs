use std::fs::{self, DirBuilder, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::computer::ComputerId;
use crate::error::DeviceKeyError;
use crate::key::{DeviceKeyPair, wipe};
use crate::store::DeviceKeyStore;
use crate::wrapper::KeyWrapper;

/// The first bytes of every key file: the format's version.
const FILE_MAGIC: &[u8] = b"HDK1";

/// What a key is sealed for, before the computer id. A new file format
/// changes both, so a key sealed for one can't be read as the other.
const CONTEXT_PREFIX: &[u8] = b"halonic device key v1:";

/// Gives each temporary file of this process its own name.
static NEXT_TEMPORARY: AtomicU64 = AtomicU64::new(0);

/// The [`DeviceKeyStore`] the phone uses (requirement `device-keys`). Each
/// computer's pair is one file, `<computer id>.key`, in a folder of the
/// app's private data: `HDK1`, then the pair as the [`KeyWrapper`] sealed
/// it for that computer. Nothing secret is in the clear on disk.
///
/// A save writes a temporary file and renames it over the old one, so a
/// reader sees the old pair or the new one, never half. On Unix the folder
/// is readable by the app only (0700) and each file too (0600). The store
/// doesn't take turns itself: the phone transport saves and forgets one
/// computer at a time.
pub struct WrappedFileStore<W: KeyWrapper> {
    folder: PathBuf,
    wrapper: W,
}

impl<W: KeyWrapper> WrappedFileStore<W> {
    /// A store that keeps its files in `folder`, made on the first save.
    pub fn new(folder: impl Into<PathBuf>, wrapper: W) -> Self {
        Self {
            folder: folder.into(),
            wrapper,
        }
    }

    fn file(&self, computer: &ComputerId) -> PathBuf {
        self.folder.join(format!("{}.key", computer.as_str()))
    }
}

impl<W: KeyWrapper> DeviceKeyStore for WrappedFileStore<W> {
    fn load(&self, computer: &ComputerId) -> Result<Option<DeviceKeyPair>, DeviceKeyError> {
        let Some(stored) = read_plain_file(&self.file(computer))? else {
            return Ok(None);
        };
        let Some(sealed) = stored.strip_prefix(FILE_MAGIC) else {
            return Err(DeviceKeyError::Unreadable);
        };
        let mut plain = self.wrapper.open(sealed, &context(computer))?;
        let pair = DeviceKeyPair::from_sealed_form(&plain);
        wipe(&mut plain);
        pair.map(Some).ok_or(DeviceKeyError::Unreadable)
    }

    fn save(&self, computer: &ComputerId, pair: &DeviceKeyPair) -> Result<(), DeviceKeyError> {
        let mut plain = pair.to_sealed_form();
        let sealed = self.wrapper.seal(&plain, &context(computer));
        wipe(&mut plain);
        let mut stored = FILE_MAGIC.to_vec();
        stored.extend_from_slice(&sealed?);
        make_private_folder(&self.folder).map_err(storage("making the key folder"))?;
        replace_file(&self.folder, &self.file(computer), &stored)
            .map_err(storage("writing the key file"))
    }

    fn forget(&self, computer: &ComputerId) -> Result<(), DeviceKeyError> {
        match fs::remove_file(self.file(computer)) {
            Err(error) if error.kind() != ErrorKind::NotFound => {
                Err(storage("removing the key file")(error))
            }
            _ => Ok(()),
        }
    }
}

/// What a computer's pair is sealed for.
fn context(computer: &ComputerId) -> Vec<u8> {
    [CONTEXT_PREFIX, computer.as_str().as_bytes()].concat()
}

/// The bytes of a plain file, `None` when nothing is there. A link or a
/// folder in its place is an error: the store never writes one.
fn read_plain_file(file: &Path) -> Result<Option<Vec<u8>>, DeviceKeyError> {
    match fs::symlink_metadata(file) {
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(storage("reading the key file")(error)),
        Ok(metadata) if !metadata.is_file() => Err(DeviceKeyError::Storage {
            message: "the key file is not a plain file".to_owned(),
        }),
        Ok(_) => fs::read(file)
            .map(Some)
            .map_err(storage("reading the key file")),
    }
}

/// Writes `bytes` to a new temporary file in `folder`, then renames it over
/// `file`. The temporary file is removed again when a step fails.
fn replace_file(folder: &Path, file: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let serial = NEXT_TEMPORARY.fetch_add(1, Ordering::Relaxed);
    let temporary = folder.join(format!(".{}-{serial}.tmp", std::process::id()));
    let written = write_new_private(&temporary, bytes).and_then(|()| fs::rename(&temporary, file));
    if written.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    written
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

fn make_private_folder(folder: &Path) -> std::io::Result<()> {
    let mut builder = DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(folder)
}

/// Turns an I/O error into [`DeviceKeyError::Storage`], naming the step.
fn storage(step: &'static str) -> impl Fn(std::io::Error) -> DeviceKeyError {
    move |error| DeviceKeyError::Storage {
        message: format!("{step}: {error}"),
    }
}
