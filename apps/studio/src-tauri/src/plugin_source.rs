//! The `plugin_source_*` commands (HAL-11571): the folder a person picks to
//! add a plugin from, and the reading of it, for the desktop Add plugin
//! dialog. Core's `PluginService.add` reads the source through these, checks
//! and hashes it, and then places exactly the bytes it read with
//! `plugin_folder_place` (`plugin_folder_place.rs`).
//!
//! The page never names a path. `plugin_source_pick` shows the folder picker
//! and keeps what the person picked in the shell's memory; every other
//! command takes the location that call answered and refuses one the person
//! didn't pick in this session. Otherwise a page could ask for `~/.ssh` and
//! read it back. A pick that is the profile, the plugins folder or inside
//! either is refused, and the profile is left out of a folder that holds it.
//!
//! Reading follows no link and never opens a special file (the
//! `halonic-workspace-files` reader's rules), leaves out the `.git` folder
//! at the top, and stops at the plugin size limits, which are core's
//! `MAX_PLUGIN_ENTRIES` and `MAX_PLUGIN_BYTES`.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use halonic_blob_store::base64url;
use halonic_git_guard::plain_path;
use halonic_profile::ProfileFolder;
use halonic_workspace_files::{
    EntryKind, Fence, FileError, FolderEntry, FolderReader, check_workspace_path, segment_as_opened,
};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::files::{EntryAnswer, profile_fence};
use crate::native_dialogs::pick_folder as show_folder_picker;
use crate::plugin_folder::plugins_root;
use crate::profile::cli_profile;

/// Most entries a plugin may have: `MAX_PLUGIN_ENTRIES` in `@halonicjs/app`.
pub(crate) const MAX_ENTRIES: usize = 2_000;

/// Most bytes a plugin may have in all, and one file at most:
/// `MAX_PLUGIN_BYTES` in `@halonicjs/app`.
pub(crate) const MAX_BYTES: u64 = 50 * 1024 * 1024;

/// How many picked folders the shell remembers; the oldest is forgotten.
const MAX_PICKED: usize = 8;

/// Why an install command was refused: a stable `kind`, one of
/// `pluginInstallRefusalKinds` in `packages/adapters/fs-tauri`, and a
/// message for the log.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct InstallRefusal {
    kind: &'static str,
    message: String,
}

impl InstallRefusal {
    pub(crate) fn new(kind: &'static str, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub(crate) fn io(message: impl std::fmt::Display) -> Self {
        Self::new("io", message.to_string())
    }

    /// The refusal's kind, for tests.
    #[cfg(test)]
    pub(crate) fn kind(&self) -> &'static str {
        self.kind
    }
}

impl From<FileError> for InstallRefusal {
    fn from(error: FileError) -> Self {
        Self::new(error.kind(), error.to_string())
    }
}

/// The folders the person picked to add a plugin from in this session, as
/// their real paths with the location the page was given for each.
#[derive(Debug, Default)]
pub struct PluginSources {
    picked: Mutex<Vec<(String, PathBuf)>>,
}

impl PluginSources {
    /// Remembers `folder`, which `check_source` accepted.
    fn remember(&self, location: String, folder: PathBuf) {
        let mut picked = self.picked.lock().unwrap_or_else(PoisonError::into_inner);
        picked.retain(|(known, _)| *known != location);
        picked.push((location, folder));
        if picked.len() > MAX_PICKED {
            picked.remove(0);
        }
    }

    /// The real path of the folder the page calls `location`: only one the
    /// person picked in this session, and only while it is still the same
    /// real folder, so a folder swapped for a link since the pick is refused.
    fn picked(&self, location: &str) -> Result<PathBuf, InstallRefusal> {
        let picked = self.picked.lock().unwrap_or_else(PoisonError::into_inner);
        let not_picked = || {
            InstallRefusal::new(
                "source_not_picked",
                "A plugin can only be added from a folder chosen with Choose folder.",
            )
        };
        let (_, folder) = picked
            .iter()
            .find(|(known, _)| known == location)
            .ok_or_else(not_picked)?;
        match fs::canonicalize(folder) {
            Ok(real) if real == *folder => Ok(real),
            _ => Err(not_picked()),
        }
    }
}

/// The real path and the location of the folder `chosen`, if a plugin may be
/// added from it: a folder that is neither the profile nor the plugins
/// folder nor inside either. A folder that holds the profile is fine; the
/// reader leaves the profile out of it.
pub(crate) fn check_source(
    chosen: &Path,
    profile: &ProfileFolder,
) -> Result<(PathBuf, String), InstallRefusal> {
    let real = fs::canonicalize(chosen).map_err(InstallRefusal::io)?;
    if !real.is_dir() {
        return Err(InstallRefusal::new("io", "That isn't a folder."));
    }
    let plugins = plugins_root(profile);
    if profile_fence(profile, &real) == Fence::Whole
        || Fence::around(&real, &plugins) == Fence::Whole
    {
        return Err(InstallRefusal::new(
            "source_not_allowed",
            "A plugin can't be added from the Halonic profile folder or the plugins folder.",
        ));
    }
    let location = plain_path(&real)
        .into_string()
        .map_err(|_| InstallRefusal::io("the folder's path isn't valid Unicode"))?;
    Ok((real, location))
}

/// Whether `path` is the `.git` folder at the top of the source, or inside it.
fn in_git_folder(path: &str) -> bool {
    let first = path.split('/').next().unwrap_or_default();
    segment_as_opened(first) == ".git"
}

/// A reader of the picked folder `root`, with the profile left out.
fn source_reader(profile: &ProfileFolder, root: PathBuf) -> FolderReader {
    let fence = profile_fence(profile, &root);
    FolderReader::new(root).fenced(fence)
}

/// Every entry under `dir` (the whole source for `None`), without the `.git`
/// folder. At most `limit` (never over [`MAX_ENTRIES`]) and one more are
/// listed, so a caller sees there are too many. The `.git` folder is never
/// walked, so a checkout with a long history costs nothing.
pub(crate) fn source_entries(
    reader: &FolderReader,
    dir: Option<&str>,
    limit: Option<usize>,
    recursive: bool,
) -> Result<Vec<FolderEntry>, FileError> {
    if dir.is_some_and(in_git_folder) {
        return Ok(Vec::new());
    }
    let limit = limit.map_or(MAX_ENTRIES, |limit| limit.min(MAX_ENTRIES));
    // `.git` is only ever the first segment, so below a folder there is none.
    if dir.is_some() || !recursive {
        let mut found = reader.entries(dir, Some(limit + 2), recursive)?;
        found.retain(|entry| !in_git_folder(&entry.path));
        found.truncate(limit + 1);
        return Ok(found);
    }
    let mut found = Vec::new();
    for top in reader.entries(None, Some(limit + 2), false)? {
        if in_git_folder(&top.path) {
            continue;
        }
        let folder = (top.kind == EntryKind::Folder).then(|| top.path.clone());
        found.push(top);
        if let Some(folder) = folder {
            let room = (limit + 1).saturating_sub(found.len());
            found.extend(reader.entries(Some(folder.as_str()), Some(room), true)?);
        }
        if found.len() > limit {
            break;
        }
    }
    found.truncate(limit + 1);
    // UTF-16 code units, as the reader and the port order them.
    found.sort_by(|left, right| left.path.encode_utf16().cmp(right.path.encode_utf16()));
    Ok(found)
}

/// The file's exact bytes, or `None` when there is none, and nothing for
/// anything in the `.git` folder. A file over [`MAX_BYTES`] is refused
/// before it is read.
pub(crate) fn source_read(
    reader: &FolderReader,
    root: &Path,
    path: &str,
) -> Result<Option<Vec<u8>>, InstallRefusal> {
    check_workspace_path(path)?;
    if in_git_folder(path) {
        return Ok(None);
    }
    let too_big = fs::symlink_metadata(root.join(path))
        .map(|seen| seen.is_file() && seen.len() > MAX_BYTES)
        .unwrap_or(false);
    if too_big {
        return Err(InstallRefusal::new(
            "too_big",
            format!("{path:?} is larger than a plugin may be."),
        ));
    }
    Ok(reader.read(path)?)
}

/// Runs `call` on a worker thread: it shows a dialog or reads files.
pub(crate) async fn on_worker<R, T, F>(app: AppHandle<R>, call: F) -> Result<T, InstallRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(&AppHandle<R>, ProfileFolder) -> Result<T, InstallRefusal> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let profile = cli_profile(&app).map_err(InstallRefusal::io)?;
        call(&app, profile)
    })
    .await
    .map_err(InstallRefusal::io)?
}

/// Shows the folder picker and keeps the folder the person picks as a place
/// to add a plugin from. Answers its location, or `null` when they pick
/// nothing. The folder isn't opened, and isn't remembered after the app
/// closes.
#[tauri::command]
pub async fn plugin_source_pick<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>, InstallRefusal> {
    on_worker(app, |app, profile| {
        let Some(chosen) = show_folder_picker(app) else {
            return Ok(None);
        };
        let (real, location) = check_source(&chosen, &profile)?;
        app.state::<PluginSources>()
            .remember(location.clone(), real);
        Ok(Some(location))
    })
    .await
}

/// Every entry under `dir` (`null` for the whole folder) of the picked folder
/// `source`, links and special files listed but never followed, and the
/// `.git` folder left out.
#[tauri::command]
pub async fn plugin_source_entries<R: Runtime>(
    app: AppHandle<R>,
    source: String,
    dir: Option<String>,
    limit: Option<usize>,
    recursive: Option<bool>,
) -> Result<Vec<EntryAnswer>, InstallRefusal> {
    on_worker(app, move |app, profile| {
        let root = app.state::<PluginSources>().picked(&source)?;
        let reader = source_reader(&profile, root);
        let found = source_entries(&reader, dir.as_deref(), limit, recursive.unwrap_or(true))?;
        Ok(found.into_iter().map(EntryAnswer::from).collect())
    })
    .await
}

/// The file's exact bytes as base64url, or `null` when there is no file, from
/// the picked folder `source`.
#[tauri::command]
pub async fn plugin_source_read<R: Runtime>(
    app: AppHandle<R>,
    source: String,
    path: String,
) -> Result<Option<String>, InstallRefusal> {
    on_worker(app, move |app, profile| {
        let root = app.state::<PluginSources>().picked(&source)?;
        let reader = source_reader(&profile, root.clone());
        Ok(source_read(&reader, &root, &path)?.map(|bytes| base64url::encode(&bytes)))
    })
    .await
}
#[cfg(test)]
#[path = "plugin_source_tests.rs"]
mod tests;
