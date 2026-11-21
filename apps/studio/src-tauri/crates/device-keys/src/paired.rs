use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use crate::computer::ComputerId;
use crate::details::ComputerDetails;
use crate::error::DeviceKeyError;
use crate::files::{make_private_folder, read_plain_file, remove_file, replace_file, storage};
use crate::key::DeviceKeyPair;
use crate::store::DeviceKeyStore;

/// The end of every details file's name, after the computer id.
const DETAILS_EXTENSION: &str = "computer";

/// One entry of [`PairedComputers::list`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PairedComputer {
    pub id: ComputerId,
    /// `None` when the details file can't be read: the computer is still
    /// listed, so the person can forget it.
    pub details: Option<ComputerDetails>,
}

/// The computers the phone is paired with (requirement `paired-computers`):
/// each one's details in a file of their own, `<computer id>.computer`, in a
/// folder of the app's private data, and its key in the [`DeviceKeyStore`].
/// A computer is paired while both are there.
///
/// Files are written whole or not at all, as the key store writes its own.
/// The store doesn't take turns itself: the shell adds and forgets one
/// computer at a time.
pub struct PairedComputers<S: DeviceKeyStore> {
    folder: PathBuf,
    keys: S,
}

impl<S: DeviceKeyStore> PairedComputers<S> {
    /// A store that keeps the details in `folder`, made on the first add,
    /// and the keys in `keys`.
    pub fn new(folder: impl Into<PathBuf>, keys: S) -> Self {
        Self {
            folder: folder.into(),
            keys,
        }
    }

    /// The key store, to load a computer's key for a reconnect.
    pub fn keys(&self) -> &S {
        &self.keys
    }

    /// Keeps a computer the phone has just paired with, replacing any
    /// earlier pairing with it, and gives its id. The key is saved first, so
    /// details are never kept without their key; when the details can't be
    /// written, the key is forgotten again (and when that fails too, its
    /// error is the one given, since a key is then kept without details).
    pub fn add(
        &self,
        details: &ComputerDetails,
        pair: &DeviceKeyPair,
    ) -> Result<ComputerId, DeviceKeyError> {
        let id = ComputerId::for_host_key(&details.host_key);
        let stored = details
            .to_stored_form()
            .ok_or(DeviceKeyError::InvalidComputer)?;
        self.keys.save(&id, pair)?;
        if let Err(error) = self.write_details(&id, &stored) {
            self.keys.forget(&id)?;
            return Err(error);
        }
        Ok(id)
    }

    /// A computer's details, `None` when it isn't paired.
    /// [`DeviceKeyError::Unreadable`] when its file can't be read, or holds
    /// another computer's details.
    pub fn details(&self, id: &ComputerId) -> Result<Option<ComputerDetails>, DeviceKeyError> {
        let stored =
            read_plain_file(&self.file(id)).map_err(storage("reading the computer's details"))?;
        let Some(stored) = stored else {
            return Ok(None);
        };
        match ComputerDetails::from_stored_form(&stored) {
            Some(details) if ComputerId::for_host_key(&details.host_key) == *id => {
                Ok(Some(details))
            }
            _ => Err(DeviceKeyError::Unreadable),
        }
    }

    /// Every paired computer, oldest pairing first, then those whose details
    /// can't be read. Files that aren't details files are left out.
    pub fn list(&self) -> Result<Vec<PairedComputer>, DeviceKeyError> {
        let mut computers = Vec::new();
        for id in self.listed_ids()? {
            let details = match self.details(&id) {
                Ok(Some(details)) => Some(details),
                Ok(None) => continue,
                Err(DeviceKeyError::Unreadable) => None,
                Err(error) => return Err(error),
            };
            computers.push(PairedComputer { id, details });
        }
        computers.sort_by_key(list_order);
        Ok(computers)
    }

    /// Forgets a computer: its key first, then its details, so a computer
    /// still listed after a failure can be forgotten again. Forgetting a
    /// computer that isn't paired succeeds.
    pub fn forget(&self, id: &ComputerId) -> Result<(), DeviceKeyError> {
        self.keys.forget(id)?;
        remove_file(&self.file(id)).map_err(storage("removing the computer's details"))
    }

    fn write_details(&self, id: &ComputerId, stored: &[u8]) -> Result<(), DeviceKeyError> {
        make_private_folder(&self.folder).map_err(storage("making the computers folder"))?;
        replace_file(&self.folder, &self.file(id), stored)
            .map_err(storage("writing the computer's details"))
    }

    /// The ids of the details files in the folder; none before the first
    /// add.
    fn listed_ids(&self) -> Result<Vec<ComputerId>, DeviceKeyError> {
        let entries = match fs::read_dir(&self.folder) {
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            entries => entries.map_err(storage("reading the computers folder"))?,
        };
        let mut ids = Vec::new();
        for entry in entries {
            let entry = entry.map_err(storage("reading the computers folder"))?;
            if let Some(id) = details_file_id(&entry.path()) {
                ids.push(id);
            }
        }
        Ok(ids)
    }

    fn file(&self, id: &ComputerId) -> PathBuf {
        self.folder
            .join(format!("{}.{DETAILS_EXTENSION}", id.as_str()))
    }
}

/// The computer a details file is for; `None` for any other file.
fn details_file_id(path: &Path) -> Option<ComputerId> {
    if path.extension()?.to_str()? != DETAILS_EXTENSION {
        return None;
    }
    ComputerId::parse(path.file_stem()?.to_str()?).ok()
}

/// Oldest pairing first, then the computers whose details can't be read;
/// the id breaks ties.
fn list_order(computer: &PairedComputer) -> (bool, Option<u64>, String) {
    let paired_at = computer
        .details
        .as_ref()
        .map(|details| details.paired_at_ms);
    (
        paired_at.is_none(),
        paired_at,
        computer.id.as_str().to_owned(),
    )
}
