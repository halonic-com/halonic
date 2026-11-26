use std::path::PathBuf;

use crate::computer::ComputerId;
use crate::error::DeviceKeyError;
use crate::files::{make_private_folder, read_plain_file, remove_file, replace_file, storage};
use crate::key::wipe;
use crate::wrapper::KeyWrapper;

/// The most bytes of text, in UTF-8, the phone keeps for one computer: the
/// page's `maxSavedBytes` (requirement `remote.phone-saved-messaging`).
pub const MAX_SAVED_TEXT_BYTES: usize = 20 * 1024 * 1024;

/// The first bytes of every saved text file: the format's version.
const FILE_MAGIC: &[u8] = b"HST1";

/// What the text is sealed for, before the computer id. It differs from
/// the key files' context, so a sealed key can't be read as saved text,
/// nor saved text as a key.
const CONTEXT_PREFIX: &[u8] = b"halonic saved text v1:";

/// Why saving text failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SavedTextError {
    /// The text is over [`MAX_SAVED_TEXT_BYTES`]; nothing was written.
    TooLarge,
    /// Sealing or the file failed, described without the text.
    Failed(DeviceKeyError),
}

impl From<DeviceKeyError> for SavedTextError {
    fn from(error: DeviceKeyError) -> Self {
        SavedTextError::Failed(error)
    }
}

/// What the phone saved of one computer's Inbox and Messenger (phase 2
/// G3b, architecture note on HAL-17511, section 2.4): the page's text, one
/// file per computer, `<computer id>.saved`, in a folder of the app's
/// private data. The file is `HST1`, then the text as the [`KeyWrapper`]
/// sealed it for that computer, so none of it is in the clear on disk.
///
/// A write replaces the file whole, as the key files are. The store keeps
/// no text in memory, and the page writes one computer's text at a time.
pub struct SavedTextStore<W: KeyWrapper> {
    folder: PathBuf,
    wrapper: W,
}

impl<W: KeyWrapper> SavedTextStore<W> {
    /// A store that keeps its files in `folder`, made on the first write.
    pub fn new(folder: impl Into<PathBuf>, wrapper: W) -> Self {
        Self {
            folder: folder.into(),
            wrapper,
        }
    }

    /// The text saved for `computer`, `None` when there is none. A file that
    /// no longer opens, because it was changed or the platform key is gone,
    /// is deleted: nothing could ever read it.
    pub fn read(&self, computer: &ComputerId) -> Result<Option<String>, DeviceKeyError> {
        let file = self.file(computer);
        let stored = read_plain_file(&file).map_err(storage("reading the saved text"))?;
        let Some(stored) = stored else {
            return Ok(None);
        };
        let opened = match stored.strip_prefix(FILE_MAGIC) {
            Some(sealed) => self.wrapper.open(sealed, &context(computer)),
            None => Err(DeviceKeyError::Unreadable),
        };
        let plain = match opened {
            Err(DeviceKeyError::Unreadable) => {
                self.clear(computer)?;
                return Ok(None);
            }
            other => other?,
        };
        match String::from_utf8(plain) {
            Ok(text) => Ok(Some(text)),
            Err(error) => {
                wipe(&mut error.into_bytes());
                self.clear(computer)?;
                Ok(None)
            }
        }
    }

    /// Replaces what is saved for `computer` with `text`, sealed. Text over
    /// [`MAX_SAVED_TEXT_BYTES`] is refused and the old file stays.
    pub fn write(&self, computer: &ComputerId, text: &str) -> Result<(), SavedTextError> {
        if text.len() > MAX_SAVED_TEXT_BYTES {
            return Err(SavedTextError::TooLarge);
        }
        let sealed = self.wrapper.seal(text.as_bytes(), &context(computer))?;
        let mut stored = FILE_MAGIC.to_vec();
        stored.extend_from_slice(&sealed);
        make_private_folder(&self.folder).map_err(storage("making the saved text folder"))?;
        replace_file(&self.folder, &self.file(computer), &stored)
            .map_err(storage("writing the saved text"))?;
        Ok(())
    }

    /// Deletes what is saved for `computer`, as on Forget and Removed.
    pub fn clear(&self, computer: &ComputerId) -> Result<(), DeviceKeyError> {
        remove_file(&self.file(computer)).map_err(storage("removing the saved text"))
    }

    fn file(&self, computer: &ComputerId) -> PathBuf {
        self.folder.join(format!("{}.saved", computer.as_str()))
    }
}

/// What a computer's saved text is sealed for.
fn context(computer: &ComputerId) -> Vec<u8> {
    [CONTEXT_PREFIX, computer.as_str().as_bytes()].concat()
}
