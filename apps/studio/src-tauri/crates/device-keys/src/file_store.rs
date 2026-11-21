use std::path::PathBuf;

use crate::computer::ComputerId;
use crate::error::DeviceKeyError;
use crate::files::{make_private_folder, read_plain_file, remove_file, replace_file, storage};
use crate::key::{DeviceKeyPair, wipe};
use crate::store::DeviceKeyStore;
use crate::wrapper::KeyWrapper;

/// The first bytes of every key file: the format's version.
const FILE_MAGIC: &[u8] = b"HDK1";

/// What a key is sealed for, before the computer id. A new file format
/// changes both, so a key sealed for one can't be read as the other.
const CONTEXT_PREFIX: &[u8] = b"halonic device key v1:";

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
        let stored =
            read_plain_file(&self.file(computer)).map_err(storage("reading the key file"))?;
        let Some(stored) = stored else {
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
        remove_file(&self.file(computer)).map_err(storage("removing the key file"))
    }
}

/// What a computer's pair is sealed for.
fn context(computer: &ComputerId) -> Vec<u8> {
    [CONTEXT_PREFIX, computer.as_str().as_bytes()].concat()
}
