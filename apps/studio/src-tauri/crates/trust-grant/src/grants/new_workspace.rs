//! Making a new workspace folder: the parent the person chooses, and the
//! folder made in it.

use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::PoisonError;

use halonic_git_guard::OpenedFolders;
use serde::Serialize;

use super::{TrustState, canonical_folder, remember_picked, same_folder};
use crate::picked::{PickedFolders, folder_identity};
use crate::question::question_text;
use crate::refusal::TrustRefusal;
use crate::workspace_name::check_workspace_name;

/// How many parent folders the shell keeps from the person's choices in one
/// session; a tenth drops the oldest.
const MAX_CHOSEN_PARENTS: usize = 9;

/// The file that marks a folder as a workspace (`new-workspace-dialog.md`).
const WORKSPACE_MARKER: &str = "workspace.yaml";

/// What [`TrustState::probe_workspace`] found at a path, as the page reads
/// it: `"new"`, `"empty"`, `"files"` or `"workspace"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FolderProbe {
    /// Nothing is there.
    New,
    /// A folder with nothing in it.
    Empty,
    /// A folder with files in it, and no `workspace.yaml`.
    Files,
    /// A folder with a `workspace.yaml`.
    Workspace,
}

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
        let created = self.checked_target(documents, fenced, parent, name)?;
        // Not `create_dir_all`: it succeeds on a folder that is there, and
        // the person never picked that one.
        if let Err(error) = std::fs::create_dir(&created) {
            return Err(match error.kind() {
                ErrorKind::AlreadyExists => exists(&created),
                _ => TrustRefusal::io(error),
            });
        }
        // Not `pick_remembered`: it takes the dialog's turn and can refuse
        // as `busy`, after the folder is made and every retry says `exists`.
        let (canonical, location) = self.open_picked(folders, &created)?;
        remember_picked(list, &canonical, &location);
        Ok(location)
    }

    /// The checks every folder command makes first, in this order: the name
    /// (`name_invalid`), the parent by real path (`folder_missing`,
    /// `folder_unreadable`, `parent_not_chosen`), then `fenced` on the
    /// folder's real path, there or not (`parent_private`). Its path is the
    /// answer. Nothing on disk is read below `parent`.
    fn checked_target(
        &self,
        documents: Option<&Path>,
        fenced: impl FnOnce(&Path) -> bool,
        parent: &str,
        name: &str,
    ) -> Result<PathBuf, TrustRefusal> {
        let name = check_workspace_name(name)?;
        let canonical_parent = folder_at_path(Path::new(parent))?;
        if !self.is_chosen_parent(&canonical_parent, documents) {
            return Err(TrustRefusal::new(
                "parent_not_chosen",
                format!("{parent:?} isn't Documents or a folder the person chose"),
            ));
        }
        let target = canonical_parent.join(&name);
        // The folder, not only its parent: a name that is the profile's own
        // folder must not make or open it.
        if fenced(&target) {
            return Err(TrustRefusal::new(
                "parent_private",
                format!(
                    "{:?} is the shell's own folder or inside it",
                    target.display()
                ),
            ));
        }
        Ok(target)
    }

    /// What is at `name` in `parent`, reading names only, never a file's
    /// contents. Makes the checks of [`Self::create_workspace`], then looks
    /// at the path without following a link:
    ///
    /// - [`FolderProbe::New`]: nothing is there;
    /// - [`FolderProbe::Workspace`]: a folder with a `workspace.yaml`;
    /// - [`FolderProbe::Empty`]: a folder with nothing in it;
    /// - [`FolderProbe::Files`]: any other folder.
    ///
    /// A link, or a file, at the path is refused as `exists`.
    pub fn probe_workspace(
        &self,
        documents: Option<&Path>,
        fenced: impl FnOnce(&Path) -> bool,
        parent: &str,
        name: &str,
    ) -> Result<FolderProbe, TrustRefusal> {
        let target = self.checked_target(documents, fenced, parent, name)?;
        match std::fs::symlink_metadata(&target) {
            Ok(meta) if meta.is_dir() => {}
            Ok(_) => return Err(exists(&target)),
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(FolderProbe::New),
            Err(error) => return Err(TrustRefusal::io(error)),
        }
        match std::fs::symlink_metadata(target.join(WORKSPACE_MARKER)) {
            Ok(_) => return Ok(FolderProbe::Workspace),
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(TrustRefusal::io(error)),
        }
        let mut entries = std::fs::read_dir(&target).map_err(TrustRefusal::io)?;
        match entries.next() {
            None => Ok(FolderProbe::Empty),
            Some(Ok(_)) => Ok(FolderProbe::Files),
            Some(Err(error)) => Err(TrustRefusal::io(error)),
        }
    }

    /// Opens the folder `name` in `parent`, which exists, as a pick does and
    /// remembers it in `list`, once the person says yes to `ask`: the trust
    /// question for that folder, which `ask` gets the text of. Its location
    /// is the answer; `None` when they say no. Refused as
    /// [`Self::probe_workspace`] does, and also:
    ///
    /// - `folder_missing`: nothing is at the path;
    /// - `busy`: the shell is showing another dialog;
    /// - `folder_changed`: after the question the path no longer leads to
    ///   the folder it showed, or a check now fails.
    ///
    /// No trust record is written.
    #[allow(clippy::too_many_arguments)]
    pub fn open_workspace(
        &self,
        folders: &OpenedFolders,
        list: &PickedFolders,
        documents: Option<&Path>,
        fenced: impl Fn(&Path) -> bool,
        parent: &str,
        name: &str,
        ask: impl FnOnce(&str) -> bool,
    ) -> Result<Option<String>, TrustRefusal> {
        let (asked, location) = self.real_folder(documents, &fenced, parent, name)?;
        let before = folder_identity(&asked);
        let yes = {
            let _asking = self.start_asking()?;
            ask(&question_text(&location))
        };
        if !yes {
            return Ok(None);
        }
        // The folder could have been replaced while the question showed.
        let (again, _) = self
            .real_folder(documents, &fenced, parent, name)
            .map_err(|refusal| match refusal.kind() {
                "folder_missing" | "exists" => TrustRefusal::new(
                    "folder_changed",
                    format!("{location:?} changed while the question showed"),
                ),
                _ => refusal,
            })?;
        // The same path can lead to a new folder, deleted and made again.
        if again != asked || !same_folder(before, folder_identity(&again)) {
            return Err(TrustRefusal::new(
                "folder_changed",
                format!("{location:?} now leads to another folder"),
            ));
        }
        let (canonical, location) = self.open_picked(folders, &again)?;
        remember_picked(list, &canonical, &location);
        Ok(Some(location))
    }

    /// The checks of [`Self::probe_workspace`], then the folder must exist
    /// as a real folder: its canonical path and its location.
    fn real_folder(
        &self,
        documents: Option<&Path>,
        fenced: &impl Fn(&Path) -> bool,
        parent: &str,
        name: &str,
    ) -> Result<(PathBuf, String), TrustRefusal> {
        let target = self.checked_target(documents, fenced, parent, name)?;
        match std::fs::symlink_metadata(&target) {
            Ok(meta) if meta.is_dir() => canonical_folder(&target),
            Ok(_) => Err(exists(&target)),
            Err(error) if error.kind() == ErrorKind::NotFound => Err(TrustRefusal::new(
                "folder_missing",
                format!("{:?} doesn't exist", target.display()),
            )),
            Err(error) => Err(TrustRefusal::io(error)),
        }
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

fn exists(path: &Path) -> TrustRefusal {
    TrustRefusal::new("exists", format!("{:?} is already there", path.display()))
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
