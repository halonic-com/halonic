//! Opening a folder the person picked before, after a restart.

use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::PoisonError;

use halonic_git_guard::{OpenedFolders, plain_path};

use super::{TrustState, same_folder};
use crate::picked::{FolderIdentity, PickedFolder, PickedFolders, folder_identity};
use crate::place::FolderPlace;
use crate::refusal::TrustRefusal;

impl TrustState {
    /// Opens a folder the person picked before, as a pick does, without the
    /// dialog. Only a location in the list opens, and only while it is
    /// still the folder they picked: the same canonical path and the same
    /// identity (device and inode on Unix, volume and file ID on Windows).
    /// Otherwise it is refused, and the entry stays so they can pick the
    /// folder again:
    ///
    /// - `not_picked`: the location isn't in the list;
    /// - `folder_missing`: nothing is at the path any more;
    /// - `folder_changed`: a link was swapped in, the folder was deleted and
    ///   made again, or the folder has no identity now; on Unix also an
    ///   entry without one (the shell never writes such an entry, so it
    ///   fails closed). An older Windows entry without one opens, and its
    ///   identity is recorded (see `still_picked`);
    /// - `folder_unreadable`: something else is at the path, or it can't be
    ///   read;
    /// - `profile_inside` / `workspace_inside_profile`: `place`, given its
    ///   real path, says it holds a moved profile or is inside the profile.
    pub fn reopen(
        &self,
        folders: &OpenedFolders,
        list: &PickedFolders,
        place: impl FnOnce(&Path) -> FolderPlace,
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
        if !still_picked(entry.identity, identity) {
            return Err(TrustRefusal::new(
                "folder_changed",
                format!("{location:?} isn't the folder the person picked any more"),
            ));
        }
        place(&canonical).check_open(&canonical)?;
        self.open(folders, location, &canonical);
        self.mark_person_opened(&canonical);
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
            halonic_shell_log::record(
                "reopen_folder",
                format!("{location:?} can't be moved first: {refusal:?}"),
            );
        }
        Ok(())
    }
}

impl PickedFolders {
    /// Whether `real_path`, a folder as another program resolved it (the
    /// agent host, HAL-20278), is one the person picked and is still that
    /// folder, by the checks `reopen` makes: the same canonical path and the
    /// same identity. `same` says whether two paths name one folder, such
    /// as two spellings of a Windows path that differ only in case. It
    /// opens nothing, and a folder that changed, went missing or can't be
    /// read answers `false`.
    pub fn is_still_picked(&self, real_path: &str, same: impl Fn(&str, &str) -> bool) -> bool {
        let Some(entry) = self.find_where(|location| same(location, real_path)) else {
            return false;
        };
        let Ok(canonical) = folder_at(&entry.location) else {
            return false;
        };
        still_picked(entry.identity, folder_identity(&canonical))
    }
}

/// Whether a picked folder's entry still names the folder now, as
/// [`same_folder`] says. One exception: an entry written on Windows before
/// the shell read identities there has none. It passes while the folder's
/// identity can be read, and reopening then writes that identity into the
/// entry, so from then on it is checked like any other. On Unix an entry
/// without one fails closed, because the shell never wrote one.
fn still_picked(entry: Option<FolderIdentity>, now: Option<FolderIdentity>) -> bool {
    match entry {
        Some(_) => same_folder(entry, now),
        None => cfg!(windows) && now.is_some(),
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
