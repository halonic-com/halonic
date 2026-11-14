//! Making a new workspace folder: the parent the person chooses, and the
//! folder made in it.

use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::PoisonError;

use halonic_git_guard::OpenedFolders;

use super::{TrustState, canonical_folder, remember_picked};
use crate::picked::PickedFolders;
use crate::refusal::TrustRefusal;
use crate::workspace_name::check_workspace_name;

/// How many parent folders the shell keeps from the person's choices in one
/// session; a tenth drops the oldest.
const MAX_CHOSEN_PARENTS: usize = 9;

impl TrustState {
    /// Shows the folder dialog through `choose` and keeps the folder the
    /// person picks as a parent for [`Self::create_workspace`]. It does not
    /// open it, make it a picked folder or remember it in the profile: a
    /// parent is only a place to make a folder in. Its location, as grants
    /// give it, is the answer; `None` when they pick nothing.
    pub fn pick_parent(
        &self,
        choose: impl FnOnce() -> Option<PathBuf>,
    ) -> Result<Option<String>, TrustRefusal> {
        let chosen = {
            let _asking = self.start_asking()?;
            choose()
        };
        let Some(chosen) = chosen else {
            return Ok(None);
        };
        let (canonical, location) = canonical_folder(&chosen)?;
        let mut parents = self.parents.lock().unwrap_or_else(PoisonError::into_inner);
        parents.retain(|parent| *parent != canonical);
        parents.push(canonical);
        if parents.len() > MAX_CHOSEN_PARENTS {
            parents.remove(0);
        }
        Ok(Some(location))
    }

    /// Makes the folder `name` in `parent` and opens it as a pick does,
    /// remembering it in `list`. Its location is the answer. Refused:
    ///
    /// - `name_invalid`, with a `reason`: see [`check_workspace_name`];
    /// - `folder_missing` / `folder_unreadable`: `parent` isn't a folder
    ///   that exists;
    /// - `parent_not_chosen`: `parent`'s real path isn't `documents` or a
    ///   folder the person chose in [`Self::pick_parent`];
    /// - `parent_private`: `fenced` says the shell's own profile holds the
    ///   new folder (the parent, or a name that is the profile's folder);
    /// - `exists`: something is at the path already. Nothing is adopted: a
    ///   folder that was there stays closed until the person picks it.
    ///
    /// `fenced` gets the new folder's real path, made or not.
    pub fn create_workspace(
        &self,
        folders: &OpenedFolders,
        list: &PickedFolders,
        documents: Option<&Path>,
        fenced: impl FnOnce(&Path) -> bool,
        parent: &str,
        name: &str,
    ) -> Result<String, TrustRefusal> {
        let name = check_workspace_name(name)?;
        let canonical_parent = folder_at_path(Path::new(parent))?;
        if !self.is_chosen_parent(&canonical_parent, documents) {
            return Err(TrustRefusal::new(
                "parent_not_chosen",
                format!("{parent:?} isn't Documents or a folder the person chose"),
            ));
        }
        let created = canonical_parent.join(&name);
        // The new folder, not only its parent: a name that is the profile's
        // own folder must not make and open it.
        if fenced(&created) {
            return Err(TrustRefusal::new(
                "parent_private",
                format!(
                    "{:?} is the shell's own folder or inside it",
                    created.display()
                ),
            ));
        }
        // Not `create_dir_all`: it succeeds on a folder that is there, and
        // the person never picked that one.
        if let Err(error) = std::fs::create_dir(&created) {
            return Err(match error.kind() {
                ErrorKind::AlreadyExists => TrustRefusal::new(
                    "exists",
                    format!("{:?} is already there", created.display()),
                ),
                _ => TrustRefusal::io(error),
            });
        }
        // Not `pick_remembered`: it takes the dialog's turn and can refuse
        // as `busy`, after the folder is made and every retry says `exists`.
        let (canonical, location) = self.open_picked(folders, &created)?;
        remember_picked(list, &canonical, &location);
        Ok(location)
    }

    /// Whether `canonical` is the Documents folder or a parent the person
    /// chose, by real path, not by text.
    fn is_chosen_parent(&self, canonical: &Path, documents: Option<&Path>) -> bool {
        let documents = documents.and_then(|folder| std::fs::canonicalize(folder).ok());
        if documents.as_deref() == Some(canonical) {
            return true;
        }
        let parents = self.parents.lock().unwrap_or_else(PoisonError::into_inner);
        parents.iter().any(|parent| parent == canonical)
    }
}

/// The canonical path of a folder that must exist: `folder_missing` when
/// nothing is there, `folder_unreadable` for anything else.
fn folder_at_path(folder: &Path) -> Result<PathBuf, TrustRefusal> {
    match std::fs::canonicalize(folder) {
        Ok(canonical) if canonical.is_dir() => Ok(canonical),
        Ok(_) => Err(TrustRefusal::new(
            "folder_unreadable",
            format!("{:?} isn't a folder", folder.display()),
        )),
        Err(error) if error.kind() == ErrorKind::NotFound => Err(TrustRefusal::new(
            "folder_missing",
            format!("{:?} doesn't exist", folder.display()),
        )),
        Err(error) => Err(TrustRefusal::new(
            "folder_unreadable",
            format!("{:?} can't be opened: {error}", folder.display()),
        )),
    }
}
