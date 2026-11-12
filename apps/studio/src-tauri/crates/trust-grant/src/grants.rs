use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, PoisonError};

use halonic_git_guard::{OpenedFolders, plain_path};
use halonic_trust_store::FileTrustStore;
use serde_json::Value;

use crate::picked::{FolderIdentity, PickedFolder, PickedFolders, folder_identity};
use crate::question::question_text;
use crate::refusal::TrustRefusal;

/// The largest record a grant saves, as JSON text. A real record is a few
/// hundred bytes; the limit keeps a broken page from filling the profile.
const MAX_RECORD_BYTES: usize = 1024 * 1024;

/// What the shell remembers between trust commands.
#[derive(Debug, Default)]
pub struct TrustState {
    /// The folders the person picked in the folder dialog, canonical. Only
    /// these spare a question: a folder a grant opened doesn't.
    picked: Mutex<Vec<PathBuf>>,
    /// The entry each pick or grant added to the opened folders, by its
    /// location, so revoking closes that exact entry.
    opened: Mutex<HashMap<String, PathBuf>>,
    /// Whether a dialog is showing. The shell shows one at a time, so the
    /// page can't stack them.
    asking: AtomicBool,
}

impl TrustState {
    /// Shows the folder dialog through `choose`, and opens the folder the
    /// person picks. Its location, as grants must give it, is the answer;
    /// `None` when they picked nothing.
    pub fn pick(
        &self,
        folders: &OpenedFolders,
        choose: impl FnOnce() -> Option<PathBuf>,
    ) -> Result<Option<String>, TrustRefusal> {
        Ok(self
            .pick_canonical(folders, choose)?
            .map(|(_, location)| location))
    }

    /// Picks as [`Self::pick`] does and remembers the folder in `list`, so
    /// [`Self::reopen`] can open it after a restart. Its identity is taken
    /// from the canonical path that opened, so the folder remembered is the
    /// folder opened. A pick that can't be remembered, such as one whose
    /// identity can't be read on Unix, still opens for now; why goes to the
    /// log.
    pub fn pick_remembered(
        &self,
        folders: &OpenedFolders,
        list: &PickedFolders,
        choose: impl FnOnce() -> Option<PathBuf>,
    ) -> Result<Option<String>, TrustRefusal> {
        let Some((canonical, location)) = self.pick_canonical(folders, choose)? else {
            return Ok(None);
        };
        let remembered = known_identity(&location, &canonical).and_then(|identity| {
            list.remember(PickedFolder {
                location: location.clone(),
                identity,
            })
        });
        if let Err(refusal) = remembered {
            eprintln!("pick_folder: {location:?} can't be remembered: {refusal:?}");
        }
        Ok(Some(location))
    }

    /// Shows the dialog and opens the folder picked: its canonical path and
    /// its location.
    fn pick_canonical(
        &self,
        folders: &OpenedFolders,
        choose: impl FnOnce() -> Option<PathBuf>,
    ) -> Result<Option<(PathBuf, String)>, TrustRefusal> {
        let chosen = {
            let _asking = self.start_asking()?;
            choose()
        };
        let Some(chosen) = chosen else {
            return Ok(None);
        };
        let (canonical, location) = canonical_folder(&chosen)?;
        self.open(folders, &location, &canonical);
        let mut picked = self.picked.lock().unwrap_or_else(PoisonError::into_inner);
        if !picked.contains(&canonical) {
            picked.push(canonical.clone());
        }
        Ok(Some((canonical, location)))
    }

    /// Saves the record and opens its folder, if the person chose the
    /// folder: it is inside a folder they picked, or `ask` showed them the
    /// question and they said yes. `ask` gets the question's text.
    ///
    /// The folder that opens is the canonical path checked before asking,
    /// not the location canonicalised again: the page can run git while the
    /// question shows, and a link it swaps in by then mustn't change which
    /// folder opens.
    pub fn grant(
        &self,
        store: &FileTrustStore,
        folders: &OpenedFolders,
        record: &Value,
        ask: impl FnOnce(&str) -> bool,
    ) -> Result<(), TrustRefusal> {
        let location = record_location(record)?;
        let canonical = checked_location(location)?;
        if !self.is_picked(&canonical) {
            let _asking = self.start_asking()?;
            if !ask(&question_text(location)) {
                return Err(TrustRefusal::new(
                    "declined",
                    format!("the person didn't trust {location:?}"),
                ));
            }
        }
        store.grant(record)?;
        self.open(folders, location, &canonical);
        Ok(())
    }

    /// Closes the folder a pick or grant opened for the location and
    /// deletes its record. The exact entry that opened is closed, not the
    /// location canonicalised again, so a link swapped in since can't close
    /// another folder instead. A picked folder no longer spares a question.
    /// The folder is closed first: if deleting the record fails, nothing
    /// stays open.
    ///
    /// Git refuses the folder at once, unless a folder still open holds it:
    /// a picked folder above it, or a folder opened on its own above it.
    pub fn revoke(
        &self,
        store: &FileTrustStore,
        folders: &OpenedFolders,
        location: &str,
    ) -> Result<(), TrustRefusal> {
        self.close(folders, location);
        Ok(store.revoke(location)?)
    }

    /// Closes the exact entry a pick, reopen or grant opened for the
    /// location, if any, so it no longer spares a question.
    fn close(&self, folders: &OpenedFolders, location: &str) {
        let opened = self
            .opened
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(location);
        if let Some(entry) = opened {
            folders.close_canonical(&entry);
            let mut picked = self.picked.lock().unwrap_or_else(PoisonError::into_inner);
            picked.retain(|picked| *picked != entry);
        }
    }

    /// Opens a folder the person picked before, as a pick does, without the
    /// dialog. Only a location in the list opens, and only while it is
    /// still the folder they picked: the same canonical path and, on Unix,
    /// the same device and inode. Otherwise it is refused, and the entry
    /// stays so they can pick the folder again:
    ///
    /// - `not_picked`: the location isn't in the list;
    /// - `folder_missing`: nothing is at the path any more;
    /// - `folder_changed`: a link was swapped in, the folder was deleted and
    ///   made again, or, on Unix, the entry or the folder has no identity
    ///   (the shell never writes such an entry, so it fails closed);
    /// - `folder_unreadable`: something else is at the path, or it can't be
    ///   read.
    pub fn reopen(
        &self,
        folders: &OpenedFolders,
        list: &PickedFolders,
        location: &str,
    ) -> Result<(), TrustRefusal> {
        let Some(entry) = list.find(location) else {
            return Err(TrustRefusal::new(
                "not_picked",
                format!("{location:?} isn't a folder the person picked"),
            ));
        };
        let canonical = folder_at(location)?;
        let identity = folder_identity(&canonical);
        if !same_folder(entry.identity, identity) {
            return Err(TrustRefusal::new(
                "folder_changed",
                format!("{location:?} isn't the folder the person picked any more"),
            ));
        }
        self.open(folders, location, &canonical);
        {
            let mut picked = self.picked.lock().unwrap_or_else(PoisonError::into_inner);
            if !picked.contains(&canonical) {
                picked.push(canonical);
            }
        }
        // Reopening is the person using the folder again, as Recent moves
        // its row up, so the entry moves first and isn't the next dropped.
        // The folder is already open; if moving fails, it stays where it is.
        // The identity written back is the one just checked.
        let checked = PickedFolder {
            location: entry.location,
            identity,
        };
        if let Err(refusal) = list.remember(checked) {
            eprintln!("reopen_folder: {location:?} can't be moved first: {refusal:?}");
        }
        Ok(())
    }

    /// Drops a picked folder from the list and closes the folder a pick,
    /// reopen or grant opened for the location, so it no longer spares a
    /// question. It only takes access away, so the page may call it freely;
    /// no error when the location isn't there. Trust records stay: removing
    /// trust is [`Self::revoke`].
    pub fn forget(
        &self,
        folders: &OpenedFolders,
        list: &PickedFolders,
        location: &str,
    ) -> Result<(), TrustRefusal> {
        self.close(folders, location);
        list.forget(location)
    }

    /// Opens a checked, canonical folder for git and the file commands as
    /// it is, and remembers the entry under its location for revoking.
    fn open(&self, folders: &OpenedFolders, location: &str, canonical: &Path) {
        folders.open_canonical(canonical.to_owned());
        let mut opened = self.opened.lock().unwrap_or_else(PoisonError::into_inner);
        opened.insert(location.to_owned(), canonical.to_owned());
    }

    fn is_picked(&self, canonical: &Path) -> bool {
        let picked = self.picked.lock().unwrap_or_else(PoisonError::into_inner);
        // By path part, not by text: `work-evil` isn't inside `work`.
        picked.iter().any(|folder| canonical.starts_with(folder))
    }

    /// Marks a dialog as showing until the guard drops, or refuses as
    /// `busy` when one already is.
    fn start_asking(&self) -> Result<Asking<'_>, TrustRefusal> {
        let started =
            self.asking
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire);
        if started.is_err() {
            return Err(TrustRefusal::new(
                "busy",
                "the shell is already showing a dialog",
            ));
        }
        Ok(Asking(&self.asking))
    }
}

/// A dialog showing; dropping it lets the next one show.
struct Asking<'a>(&'a AtomicBool);

impl Drop for Asking<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

/// The record's location, or `invalid_record` when the record has none or
/// is too large to save.
fn record_location(record: &Value) -> Result<&str, TrustRefusal> {
    let size = serde_json::to_vec(record).map_or(usize::MAX, |text| text.len());
    if size > MAX_RECORD_BYTES {
        return Err(TrustRefusal::new(
            "invalid_record",
            format!("a trust record may hold at most {MAX_RECORD_BYTES} bytes"),
        ));
    }
    record
        .get("location")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            TrustRefusal::new(
                "invalid_record",
                "a trust record must be an object with a location",
            )
        })
}

/// The canonical folder for a location that must already be canonical, in
/// the plain form the CLI keys its records by (see `plain_path`). A location
/// that names the folder another way, through `..`, a link, a trailing
/// separator or `\\?\`, is refused, not rewritten: the record's key and the
/// opened folder must be the same path, so that revoking the record closes
/// the folder.
fn checked_location(location: &str) -> Result<PathBuf, TrustRefusal> {
    let (canonical, plain) = canonical_folder(Path::new(location))?;
    if plain != location {
        return Err(TrustRefusal::new(
            "invalid_record",
            format!("{location:?} isn't the folder's canonical path, {plain:?}"),
        ));
    }
    Ok(canonical)
}

/// The identity to remember for a picked folder: on Unix it must have one,
/// so a pick whose device and inode can't be read isn't remembered. Windows
/// has none yet (see [`FolderIdentity`]).
fn known_identity(
    location: &str,
    canonical: &Path,
) -> Result<Option<FolderIdentity>, TrustRefusal> {
    let identity = folder_identity(canonical);
    if cfg!(unix) && identity.is_none() {
        return Err(TrustRefusal::new(
            "folder_unreadable",
            format!("{location:?} has no device and inode to remember it by"),
        ));
    }
    Ok(identity)
}

/// Whether a remembered identity matches the folder's now. On Unix both
/// must be known and equal: an entry without one fails closed, because the
/// shell never writes one. Elsewhere an entry without one passes, as the
/// system gives none.
fn same_folder(remembered: Option<FolderIdentity>, now: Option<FolderIdentity>) -> bool {
    if cfg!(unix) {
        remembered.is_some() && remembered == now
    } else {
        remembered.is_none() || remembered == now
    }
}

/// The canonical folder at a picked location, if it is still the folder
/// that was picked there: `folder_missing` when nothing is at the path any
/// more, so Studio doesn't say "no permission" for a moved folder;
/// `folder_changed` when the path now leads somewhere else, through a link
/// swapped in; `folder_unreadable` for anything else.
fn folder_at(location: &str) -> Result<PathBuf, TrustRefusal> {
    let canonical = match std::fs::canonicalize(location) {
        Ok(canonical) => canonical,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return Err(TrustRefusal::new(
                "folder_missing",
                format!("{location:?} doesn't exist any more"),
            ));
        }
        Err(error) => {
            return Err(TrustRefusal::new(
                "folder_unreadable",
                format!("{location:?} can't be opened: {error}"),
            ));
        }
    };
    if !canonical.is_dir() {
        return Err(TrustRefusal::new(
            "folder_unreadable",
            format!("{location:?} isn't a folder"),
        ));
    }
    if plain_path(&canonical).to_str() != Some(location) {
        return Err(TrustRefusal::new(
            "folder_changed",
            format!("{location:?} leads to another folder now"),
        ));
    }
    Ok(canonical)
}

/// A folder's canonical path, and its plain form as text, or
/// `folder_unreadable` when it isn't a folder that exists or its path isn't
/// Unicode.
fn canonical_folder(folder: &Path) -> Result<(PathBuf, String), TrustRefusal> {
    let unreadable = || {
        TrustRefusal::new(
            "folder_unreadable",
            format!("{:?} isn't a folder that can be opened", folder.display()),
        )
    };
    let canonical = std::fs::canonicalize(folder).map_err(|_| unreadable())?;
    if !canonical.is_dir() {
        return Err(unreadable());
    }
    let plain = plain_path(&canonical)
        .into_string()
        .map_err(|_| unreadable())?;
    Ok((canonical, plain))
}
