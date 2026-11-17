//! The `plugin_git_export*` commands (HAL-11571): a plugin given as a git
//! address, for the desktop Add plugin dialog. They are not a clone. The
//! shell exports one commit of the repository, files only, through
//! `halonic-git-guard`'s `GitRunner::export_commit` (the same steps and
//! refusals as the CLI's `halonic plugin add <git address>`), into a folder
//! of its own in the app's data folder, never an opened folder. That folder
//! is then a place to add a plugin from, exactly like a folder the person
//! picked: the page reads it with `plugin_source_entries` and
//! `plugin_source_read` (`plugin_source.rs`), core checks and hashes it, and
//! `plugin_folder_place` writes what it read.
//!
//! The page names the address and, if it likes, a branch, tag or commit id,
//! and a token of its own to stop the export by. `plugin_git_export_end`
//! stops an export that is still running, which stops git with everything
//! it started, or removes the folder of one that has finished. Either way no
//! folder of the export is left, and the page's dialog calls it when it is
//! closed, so a closed dialog leaves nothing behind. Folders left by a
//! crash are removed by the first export after the app starts.
//!
//! Nothing runs from the repository: no hook, no script, no install, no
//! submodule, no filter, and none of the user's own git config.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use halonic_git_guard::{ExportLimits, GitError, plain_path};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::git::GitState;
use crate::plugin_source::{InstallRefusal, MAX_BYTES, MAX_ENTRIES, PluginSources, on_worker};

/// How many exports may be running or kept at once.
const MAX_EXPORTS: usize = 4;

/// The longest token the page may name an export by.
const MAX_TOKEN: usize = 64;

/// An export that has finished: where its folders are and the location the
/// page was given for its files.
#[derive(Debug)]
pub(crate) struct Kept {
    pub(crate) work: PathBuf,
    pub(crate) location: String,
}

#[derive(Debug)]
enum Export {
    Running(Arc<AtomicBool>),
    Kept(Kept),
}

/// The exports of this session, by the token the page named them with.
#[derive(Debug, Default)]
pub struct PluginGitExports {
    exports: Mutex<HashMap<String, Export>>,
}

/// What the end of an export has to undo.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Ended {
    /// There was no such export.
    Nothing,
    /// It was running and has been told to stop; it removes its own folders.
    Stopped,
    /// It had finished; its folder is removed and its location forgotten.
    Removed(String),
}

impl PluginGitExports {
    /// Registers a running export under `token` and answers the flag that
    /// stops it. Refuses a token that is in use or one that isn't plain, and
    /// refuses a fifth export. When nothing is running or kept, the folders
    /// in `parent` are left over from an earlier run of the app, and are
    /// removed.
    pub(crate) fn begin(
        &self,
        token: &str,
        parent: &Path,
    ) -> Result<Arc<AtomicBool>, InstallRefusal> {
        let plain = !token.is_empty()
            && token.len() <= MAX_TOKEN
            && token
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        if !plain {
            return Err(InstallRefusal::new(
                "export_token_invalid",
                "An export's token is one to 64 letters, digits, - or _.",
            ));
        }
        let mut exports = self.exports.lock().unwrap_or_else(PoisonError::into_inner);
        if exports.contains_key(token) {
            return Err(InstallRefusal::new(
                "export_token_invalid",
                "That export is already in use.",
            ));
        }
        if exports.len() >= MAX_EXPORTS {
            return Err(InstallRefusal::new(
                "export_busy",
                "Too many git exports are open; close one first.",
            ));
        }
        if exports.is_empty() {
            sweep(parent);
        }
        let cancel = Arc::new(AtomicBool::new(false));
        exports.insert(token.to_owned(), Export::Running(Arc::clone(&cancel)));
        Ok(cancel)
    }

    /// Keeps the finished export under `token`. If the person ended the
    /// export while it ran, there is nothing to keep: its folder is removed
    /// and `false` answered.
    pub(crate) fn finish(&self, token: &str, kept: Kept) -> bool {
        let mut exports = self.exports.lock().unwrap_or_else(PoisonError::into_inner);
        let ended_meanwhile = !exports.contains_key(token)
            || matches!(exports.get(token), Some(Export::Running(cancel)) if cancel.load(Ordering::SeqCst));
        if ended_meanwhile {
            exports.remove(token);
            let _ = fs::remove_dir_all(&kept.work);
            return false;
        }
        exports.insert(token.to_owned(), Export::Kept(kept));
        true
    }

    /// Forgets a running export that failed.
    pub(crate) fn failed(&self, token: &str) {
        let mut exports = self.exports.lock().unwrap_or_else(PoisonError::into_inner);
        exports.remove(token);
    }

    /// Ends the export under `token`: stops it if it runs, removes its
    /// folder if it has finished.
    pub(crate) fn end(&self, token: &str) -> Ended {
        let mut exports = self.exports.lock().unwrap_or_else(PoisonError::into_inner);
        match exports.get(token) {
            None => Ended::Nothing,
            Some(Export::Running(cancel)) => {
                // The export removes its own folders, and `finish` forgets it.
                cancel.store(true, Ordering::SeqCst);
                Ended::Stopped
            }
            Some(Export::Kept(_)) => match exports.remove(token) {
                Some(Export::Kept(kept)) => {
                    let _ = fs::remove_dir_all(&kept.work);
                    Ended::Removed(kept.location)
                }
                _ => Ended::Nothing,
            },
        }
    }
}

/// Removes what an earlier run of the app left in `parent`. Errors are
/// ignored on purpose: a folder that stays only costs disk space, and the
/// next export tries again.
fn sweep(parent: &Path) {
    let Ok(entries) = fs::read_dir(parent) else {
        return;
    };
    for entry in entries.flatten() {
        let _ = fs::remove_dir_all(entry.path());
    }
}

/// The folder the exports are made in, in the app's own data folder.
fn exports_folder<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, InstallRefusal> {
    app.path()
        .app_local_data_dir()
        .map(|folder| folder.join("plugin-git-export"))
        .map_err(InstallRefusal::io)
}

/// Why git or the export said no, as a refusal with git's own kind.
fn refusal(error: &GitError) -> InstallRefusal {
    InstallRefusal::new(error.kind(), error.to_string())
}

/// What a finished export gives the page.
#[derive(Debug, Serialize)]
pub struct GitExportAnswer {
    /// The place to add the plugin from: pass it as `source` to
    /// `plugin_source_entries` and `plugin_source_read`.
    location: String,
    /// The full id of the commit that was exported.
    commit: String,
    /// The remote's default branch, when no reference was named and the
    /// remote says which it is.
    branch: Option<String>,
}

/// Exports one commit of the git repository at `address` (the remote's
/// `HEAD` when `reference` is `null`) and answers the place to add the
/// plugin from. `token` is the page's own name for this export, which
/// `plugin_git_export_end` stops it by.
#[tauri::command]
pub async fn plugin_git_export<R: Runtime>(
    app: AppHandle<R>,
    address: String,
    reference: Option<String>,
    token: String,
) -> Result<GitExportAnswer, InstallRefusal> {
    on_worker(app, move |app, _profile| {
        let parent = exports_folder(app)?;
        let exports = app.state::<PluginGitExports>();
        let cancel = exports.begin(&token, &parent)?;
        let result = export(app, &address, reference.as_deref(), &parent, &cancel);
        match result {
            Ok(exported) => {
                let location = plain_path(&exported.files)
                    .into_string()
                    .map_err(|_| InstallRefusal::io("the folder's path isn't valid Unicode"));
                let location = match location {
                    Ok(location) => location,
                    Err(refused) => {
                        let _ = fs::remove_dir_all(&exported.work);
                        exports.failed(&token);
                        return Err(refused);
                    }
                };
                let kept = Kept {
                    work: exported.work,
                    location: location.clone(),
                };
                if !exports.finish(&token, kept) {
                    return Err(refusal(&GitError::Cancelled));
                }
                app.state::<PluginSources>()
                    .remember(location.clone(), exported.files);
                Ok(GitExportAnswer {
                    location,
                    commit: exported.commit,
                    branch: exported.branch,
                })
            }
            Err(error) => {
                exports.failed(&token);
                Err(refusal(&error))
            }
        }
    })
    .await
}

fn export<R: Runtime>(
    app: &AppHandle<R>,
    address: &str,
    reference: Option<&str>,
    parent: &Path,
    cancel: &AtomicBool,
) -> Result<halonic_git_guard::ExportedCommit, GitError> {
    let runner = app.state::<GitState>().runner(app)?;
    let limits = ExportLimits {
        max_entries: MAX_ENTRIES,
        max_bytes: MAX_BYTES,
        ..ExportLimits::default()
    };
    runner.export_commit(address, reference, parent, limits, cancel)
}

/// Ends the export the page named `token`: stops it if it is running, or
/// removes the folder of one that has finished, and forgets its place to add
/// a plugin from. It answers nothing and refuses nothing, so the dialog can
/// call it whenever it closes.
#[tauri::command]
pub async fn plugin_git_export_end<R: Runtime>(app: AppHandle<R>, token: String) {
    // A removal can be slow on a large folder, so it is off the async runtime.
    let _ = tauri::async_runtime::spawn_blocking(move || {
        if let Ended::Removed(location) = app.state::<PluginGitExports>().end(&token) {
            app.state::<PluginSources>().forget(&location);
        }
    })
    .await;
}

#[cfg(test)]
#[path = "plugin_git_tests.rs"]
mod tests;
