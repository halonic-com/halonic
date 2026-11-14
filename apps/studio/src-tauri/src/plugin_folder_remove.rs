//! `plugin_folder_remove` (HAL-9377): deletes one installed plugin's folder
//! from the profile's plugins folder, for the plugins page's Remove action.
//! The reading commands are in `plugin_folder.rs`.
//!
//! The page names one plugin, never a path. The shell never follows a link:
//! a link in the plugins folder is removed itself and its target is left
//! alone, and a plain file is refused. The plugin's trust, secrets and
//! settings are not the shell's: core's `PluginService.remove` clears them
//! through their own stores.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use halonic_workspace_files::{FileError, check_public_workspace_path};
use tauri::{AppHandle, Runtime};

use crate::files::FileRefusal;
use crate::plugin_folder::{in_plugins_folder, io, plugins_reader};

/// Deletes the folder of `plugin` under `root`. A plugin that isn't there,
/// or a plugins folder that isn't, is already removed. The name must match
/// an entry exactly, even on a disk that ignores case.
fn remove_plugin(root: &Path, plugin: &str) -> Result<(), FileError> {
    check_public_workspace_path(plugin)?;
    if plugin.contains('/') {
        return Err(FileError::UnsafePath {
            path: plugin.to_owned(),
            reason: "a plugin's folder is one name",
        });
    }
    // Windows drops trailing dots and spaces when it opens a path, so `...`
    // would open the plugins folder itself. Refuse them here rather than rely
    // on the verbatim path that `canonicalize` happens to return.
    if plugin.ends_with(['.', ' ']) {
        return Err(FileError::UnsafePath {
            path: plugin.to_owned(),
            reason: "a plugin's name does not end in a dot or a space",
        });
    }
    // The reader refuses a plugins folder that is a link or a file.
    if plugins_reader(root)?.is_none() {
        return Ok(());
    }
    let real_root = fs::canonicalize(root).map_err(|error| io("", &error))?;
    // On a disk that ignores case, `symlink_metadata("weather")` finds
    // `Weather`, so look for the exact name in the listing first.
    if !has_exact_entry(&real_root, plugin)? {
        return Ok(());
    }
    let target = real_root.join(plugin);
    let seen = match fs::symlink_metadata(&target) {
        Ok(seen) => seen,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(io(plugin, &error)),
    };
    let file_type = seen.file_type();
    if file_type.is_symlink() {
        return remove_link(&target).map_err(|error| io(plugin, &error));
    }
    if !file_type.is_dir() {
        return Err(FileError::SpecialPath {
            path: plugin.to_owned(),
        });
    }
    // `remove_dir_all` deletes a link inside the folder, not what it points at.
    fs::remove_dir_all(&target).map_err(|error| io(plugin, &error))
}

/// Whether the top of `root` lists an entry named exactly `name`.
fn has_exact_entry(root: &Path, name: &str) -> Result<bool, FileError> {
    for entry in fs::read_dir(root).map_err(|error| io("", &error))? {
        let entry = entry.map_err(|error| io("", &error))?;
        if entry.file_name() == name {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Removes the link entry itself. Windows takes a folder link as a folder.
fn remove_link(link: &Path) -> std::io::Result<()> {
    fs::remove_file(link).or_else(|file_error| fs::remove_dir(link).map_err(|_| file_error))
}

/// Deletes the folder of the installed plugin `plugin`. It succeeds when
/// there is none, and refuses a name that isn't one plain folder name.
#[tauri::command]
pub async fn plugin_folder_remove<R: Runtime>(
    app: AppHandle<R>,
    plugin: String,
) -> Result<(), FileRefusal> {
    in_plugins_folder(app, move |root| remove_plugin(root, &plugin)).await
}

#[cfg(test)]
#[path = "plugin_folder_remove_tests.rs"]
mod tests;
