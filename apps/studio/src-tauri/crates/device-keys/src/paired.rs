use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use crate::computer::ComputerId;
use crate::details::{ComputerDetails, MAX_ENDPOINTS, Standing};
use crate::error::DeviceKeyError;
use crate::files::{make_private_folder, read_plain_file, remove_file, replace_file, storage};
use crate::key::{DeviceKeyPair, KEY_BYTES};
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

/// A pairing the computer has just allowed, as [`PairedComputers::add`]
/// keeps it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewPairing {
    /// The name the computer gave in pairing message 2.
    pub name: String,
    /// The endpoint the phone paired through.
    pub endpoint: String,
    /// The computer's static key, to pin.
    pub host_key: [u8; KEY_BYTES],
    /// When the computer said `paired`, in milliseconds since the Unix
    /// epoch.
    pub paired_at_ms: u64,
}

/// The computers the phone has paired with (requirement
/// `paired-computers`): each one's details in a file of their own,
/// `<computer id>.computer`, in a folder of the app's private data, and its
/// key in the [`DeviceKeyStore`]. A computer stays listed until the person
/// forgets it, Removed included; while it is paired or can't be confirmed,
/// its key is kept too.
///
/// Files are written whole or not at all, as the key store writes its own.
/// The store doesn't take turns itself: the shell changes one computer at
/// a time.
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

    /// Keeps a computer the phone has just paired with and gives its id.
    ///
    /// The pairing replaces a listed computer, keeping its id: `again` when
    /// the person chose Pair again on it, or else the computer that pins the
    /// same key. A computer with neither gets [`ComputerId::for_host_key`].
    /// When `again` replaces it, a twin that pins the same key is forgotten,
    /// so the computer is listed once. The new endpoint goes first, before
    /// those kept from the earlier pairing.
    ///
    /// The key is saved before the details; when the details can't be
    /// written, the key is forgotten again (and when that fails too, its
    /// error is the one given, since a key is then kept without details).
    pub fn add(
        &self,
        pairing: &NewPairing,
        pair: &DeviceKeyPair,
        again: Option<&ComputerId>,
    ) -> Result<ComputerId, DeviceKeyError> {
        let listed = self.list()?;
        let pinning = listed
            .iter()
            .find(|computer| pins(computer, &pairing.host_key))
            .map(|computer| computer.id.clone());
        let again = again.filter(|again| listed.iter().any(|computer| computer.id == **again));
        let id = again
            .or(pinning.as_ref())
            .cloned()
            .unwrap_or_else(|| ComputerId::for_host_key(&pairing.host_key));
        let earlier = listed
            .into_iter()
            .find(|computer| computer.id == id)
            .and_then(|computer| computer.details);
        let details = ComputerDetails {
            name: pairing.name.clone(),
            endpoints: latest_first(&pairing.endpoint, earlier),
            standing: Standing::Paired {
                host_key: pairing.host_key,
            },
            paired_at_ms: pairing.paired_at_ms,
            last_connected_at_ms: None,
        };
        let stored = details
            .to_stored_form(&id)
            .ok_or(DeviceKeyError::InvalidComputer)?;
        self.keys.save(&id, pair)?;
        if let Err(error) = self.write_details(&id, &stored) {
            self.keys.forget(&id)?;
            return Err(error);
        }
        if let Some(twin) = pinning.filter(|twin| *twin != id) {
            self.forget(&twin)?;
        }
        Ok(id)
    }

    /// A computer's details, `None` when it isn't listed.
    /// [`DeviceKeyError::Unreadable`] when its file can't be read, or holds
    /// another computer's details.
    pub fn details(&self, id: &ComputerId) -> Result<Option<ComputerDetails>, DeviceKeyError> {
        let stored =
            read_plain_file(&self.file(id)).map_err(storage("reading the computer's details"))?;
        let Some(stored) = stored else {
            return Ok(None);
        };
        match ComputerDetails::from_stored_form(&stored) {
            Some((stored_for, details)) if stored_for == *id => Ok(Some(details)),
            _ => Err(DeviceKeyError::Unreadable),
        }
    }

    /// Every listed computer, oldest pairing first, then those whose
    /// details can't be read. Files that aren't details files are left out.
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

    /// The phone has connected to the computer, at `at_ms`: it is paired
    /// again if it couldn't be confirmed. Nothing changes for a computer
    /// that is Removed or not listed.
    pub fn mark_connected(&self, id: &ComputerId, at_ms: u64) -> Result<(), DeviceKeyError> {
        self.update(id, |details| {
            let Some(host_key) = details.standing.host_key().copied() else {
                return;
            };
            details.standing = Standing::Paired { host_key };
            details.last_connected_at_ms = Some(at_ms);
        })
    }

    /// The computer answered with another key than the pinned one. Its key
    /// and pin stay. Nothing changes for a computer that is Removed or not
    /// listed.
    pub fn mark_cant_confirm(&self, id: &ComputerId) -> Result<(), DeviceKeyError> {
        self.update(id, |details| {
            if let Standing::Paired { host_key } = details.standing {
                details.standing = Standing::CantConfirm { host_key };
            }
        })
    }

    /// The computer proved who it is, then said the phone isn't paired
    /// (Removed): the key goes first, then the pin, and the computer stays
    /// listed with its name and endpoints until the person forgets it.
    pub fn mark_removed(&self, id: &ComputerId) -> Result<(), DeviceKeyError> {
        self.keys.forget(id)?;
        self.update(id, |details| details.standing = Standing::Removed)
    }

    /// Forgets a computer: its key first, then its details, so a computer
    /// still listed after a failure can be forgotten again. Forgetting a
    /// computer that isn't listed succeeds.
    pub fn forget(&self, id: &ComputerId) -> Result<(), DeviceKeyError> {
        self.keys.forget(id)?;
        remove_file(&self.file(id)).map_err(storage("removing the computer's details"))
    }

    /// Changes a listed computer's details and writes them back; nothing
    /// for a computer that isn't listed.
    fn update(
        &self,
        id: &ComputerId,
        change: impl FnOnce(&mut ComputerDetails),
    ) -> Result<(), DeviceKeyError> {
        let Some(mut details) = self.details(id)? else {
            return Ok(());
        };
        change(&mut details);
        let stored = details
            .to_stored_form(id)
            .ok_or(DeviceKeyError::InvalidComputer)?;
        self.write_details(id, &stored)
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

/// Whether a listed computer pins `host_key`.
fn pins(computer: &PairedComputer, host_key: &[u8; KEY_BYTES]) -> bool {
    let pinned = computer
        .details
        .as_ref()
        .and_then(|details| details.standing.host_key());
    pinned == Some(host_key)
}

/// `endpoint`, then the earlier pairing's endpoints without it, at most
/// [`MAX_ENDPOINTS`] in all.
fn latest_first(endpoint: &str, earlier: Option<ComputerDetails>) -> Vec<String> {
    let earlier = earlier.map(|details| details.endpoints).unwrap_or_default();
    std::iter::once(endpoint.to_owned())
        .chain(earlier.into_iter().filter(|kept| kept != endpoint))
        .take(MAX_ENDPOINTS)
        .collect()
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
