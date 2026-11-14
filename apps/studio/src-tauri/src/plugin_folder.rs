//! The `plugin_folder_*` commands (HAL-9377): the installed plugins, which
//! the desktop plugins host in `apps/studio` reads through the shell. The
//! plugins are in the profile's `plugins` folder, which the `folder_*`
//! commands refuse (it is in the profile), so these commands read it
//! themselves, as `pluginsFolder` in `@halonicjs/profile` names it.
//!
//! No command takes a path for the root: the shell works out the folder
//! itself. These only read. A link is listed and never followed, a link
//! as the plugins folder itself is refused, and a special file is never
//! opened (the `halonic-workspace-files` reader's rules). The one command that
//! writes, `plugin_folder_remove`, is in `plugin_folder_remove.rs`. `plugin_folder_reveal`
//! shows the plugins folder, or one plugin's folder, in the file manager,
//! and nothing else.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use halonic_blob_store::base64url;
use halonic_profile::ProfileFolder;
use halonic_workspace_files::{FileError, FolderReader, check_workspace_path};
use tauri::{AppHandle, Runtime};

use crate::files::{EntryAnswer, FileRefusal};
use crate::profile::cli_profile;

/// The plugins folder of `profile`.
pub(crate) fn plugins_root(profile: &ProfileFolder) -> PathBuf {
    PathBuf::from(profile.plugins_folder())
}

/// A reader of the plugins folder at `root`, or `None` when there is no
/// folder yet: nothing is created, and no plugin is installed. A link, or
/// anything that isn't a folder, is refused: the reader would follow a link
/// that is its own root.
pub(crate) fn plugins_reader(root: &Path) -> Result<Option<FolderReader>, FileError> {
    let seen = match fs::symlink_metadata(root) {
        Ok(seen) => seen,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(io("", &error)),
    };
    if seen.file_type().is_symlink() {
        return Err(FileError::LinkedPath {
            path: String::new(),
        });
    }
    if !seen.is_dir() {
        return Err(FileError::SpecialPath {
            path: String::new(),
        });
    }
    let real = fs::canonicalize(root).map_err(|error| io("", &error))?;
    Ok(Some(FolderReader::new(real)))
}

pub(crate) fn io(path: &str, error: &std::io::Error) -> FileError {
    FileError::Io {
        message: format!("{path:?}: {error}"),
    }
}

/// Every entry under `dir` (`None` for the whole plugins folder), as
/// `folder_entries` lists them.
fn entries(
    root: &Path,
    dir: Option<&str>,
    limit: Option<usize>,
    recursive: bool,
) -> Result<Vec<EntryAnswer>, FileError> {
    let Some(reader) = plugins_reader(root)? else {
        return Ok(Vec::new());
    };
    let found = reader.entries(dir, limit, recursive)?;
    Ok(found.into_iter().map(EntryAnswer::from).collect())
}

/// The file's exact bytes as base64url, or `None` when there is no file.
fn read(root: &Path, path: &str) -> Result<Option<String>, FileError> {
    let Some(reader) = plugins_reader(root)? else {
        return Ok(None);
    };
    Ok(reader.read(path)?.map(|bytes| base64url::encode(&bytes)))
}

/// The real location of the entry at `path` (the plugins folder for `None`).
fn location(root: &Path, path: Option<&str>) -> Result<Option<String>, FileError> {
    let Some(reader) = plugins_reader(root)? else {
        return Ok(None);
    };
    reader.location_of(path)
}

/// The folder to show for `plugin`, or for the plugins folder when `None`:
/// the plugin's own folder when it is one, never a link, never a file. A
/// plugins folder that isn't there yet gives `None`, so nothing is shown.
fn folder_to_reveal(root: &Path, plugin: Option<&str>) -> Result<Option<PathBuf>, FileError> {
    let Some(reader) = plugins_reader(root)? else {
        return Ok(None);
    };
    let Some(plugin) = plugin else {
        return Ok(Some(PathBuf::from(location_of_root(&reader)?)));
    };
    check_workspace_path(plugin)?;
    if plugin.contains('/') {
        return Err(FileError::UnsafePath {
            path: plugin.to_owned(),
            reason: "a plugin's folder is one name",
        });
    }
    let entries = reader.entries(None, None, false)?;
    let is_folder = entries.iter().any(|entry| {
        entry.path == plugin && entry.kind == halonic_workspace_files::EntryKind::Folder
    });
    if !is_folder {
        return Ok(None);
    }
    Ok(reader.location_of(Some(plugin))?.map(PathBuf::from))
}

fn location_of_root(reader: &FolderReader) -> Result<String, FileError> {
    reader.location_of(None)?.ok_or_else(|| FileError::Io {
        message: "the plugins folder has gone".to_owned(),
    })
}

/// Runs `call` on the plugins folder of the CLI's profile, on a worker
/// thread: it reads files.
pub(crate) async fn in_plugins_folder<R, T, F>(app: AppHandle<R>, call: F) -> Result<T, FileRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(&Path) -> Result<T, FileError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let profile = cli_profile(&app).map_err(|message| FileError::Io { message })?;
        Ok(call(&plugins_root(&profile))?)
    })
    .await
    .map_err(|error| FileError::Io {
        message: error.to_string(),
    })?
}

/// Every entry under `dir` (`null` for the whole plugins folder), with its
/// kind, links and special files listed but never followed. The answer is
/// empty while no plugin has been installed.
#[tauri::command]
pub async fn plugin_folder_entries<R: Runtime>(
    app: AppHandle<R>,
    dir: Option<String>,
    limit: Option<usize>,
    recursive: Option<bool>,
) -> Result<Vec<EntryAnswer>, FileRefusal> {
    in_plugins_folder(app, move |root| {
        entries(root, dir.as_deref(), limit, recursive.unwrap_or(true))
    })
    .await
}

/// The file's exact bytes as base64url, or `null` when there is no file.
#[tauri::command]
pub async fn plugin_folder_read<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<Option<String>, FileRefusal> {
    in_plugins_folder(app, move |root| read(root, &path)).await
}

/// The real location of the entry at `path` (`null` for the plugins folder),
/// or `null` when there is none.
#[tauri::command]
pub async fn plugin_folder_location<R: Runtime>(
    app: AppHandle<R>,
    path: Option<String>,
) -> Result<Option<String>, FileRefusal> {
    in_plugins_folder(app, move |root| location(root, path.as_deref())).await
}

/// Shows the plugins folder, or the folder of the plugin `plugin`, in the
/// file manager. Answers whether there was a folder to show.
#[tauri::command]
pub async fn plugin_folder_reveal<R: Runtime>(
    app: AppHandle<R>,
    plugin: Option<String>,
) -> Result<bool, FileRefusal> {
    in_plugins_folder(app, move |root| {
        let Some(folder) = folder_to_reveal(root, plugin.as_deref())? else {
            return Ok(false);
        };
        tauri_plugin_opener::reveal_item_in_dir(&folder).map_err(|error| FileError::Io {
            message: format!("the file manager couldn't show the folder: {error}"),
        })?;
        Ok(true)
    })
    .await
}

#[cfg(test)]
#[path = "plugin_folder_tests.rs"]
mod tests;
