use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use crate::error::GitError;

/// The folders the user opened, the only places git may run (requirement
/// `opened-folders`).
///
/// It starts empty, so every folder is refused until the folder picker
/// (HAL-191) adds the folders the user chooses through [`Self::open`].
#[derive(Debug, Default)]
pub struct OpenedFolders {
    folders: Mutex<Vec<PathBuf>>,
}

impl OpenedFolders {
    /// A registry with no opened folders.
    pub fn new() -> Self {
        Self::default()
    }

    /// Records a folder the user opened. The folder is canonicalised now,
    /// so a later rename of a link in its path changes nothing.
    pub fn open(&self, folder: &Path) -> Result<(), GitError> {
        let folder = canonical(folder)?;
        let mut folders = self.folders.lock().unwrap_or_else(PoisonError::into_inner);
        if !folders.contains(&folder) {
            folders.push(folder);
        }
        Ok(())
    }

    /// Checks that `folder` is an opened folder or inside one, and returns
    /// its canonical form, which is where git then runs.
    ///
    /// Both sides go through the same canonicalisation, so `..`, links and,
    /// on Windows, the long-path prefix that canonicalising adds can't make
    /// the check wrong. The comparison is by path part, not by text: a
    /// folder `work-evil` is not inside a folder `work` next to it.
    pub fn check(&self, folder: &Path) -> Result<PathBuf, GitError> {
        let folder = canonical(folder)?;
        if self.contains_canonical(&folder) {
            return Ok(folder);
        }
        Err(GitError::FolderNotOpened)
    }

    /// Whether an already canonical path is inside an opened folder.
    pub(crate) fn contains_canonical(&self, folder: &Path) -> bool {
        let folders = self.folders.lock().unwrap_or_else(PoisonError::into_inner);
        folders.iter().any(|opened| folder.starts_with(opened))
    }
}

/// Canonicalises a path that must exist and be a folder.
pub(crate) fn canonical(folder: &Path) -> Result<PathBuf, GitError> {
    let canonical = std::fs::canonicalize(folder).map_err(|_| GitError::FolderUnreadable)?;
    if !canonical.is_dir() {
        return Err(GitError::FolderUnreadable);
    }
    Ok(canonical)
}

/// A canonical path in the form to give git.
///
/// On Windows, canonicalising adds the long-path prefix, `\\?\` before a
/// drive path and `\\?\UNC\` before a network path. git can't resolve a
/// relative alternate against a git folder written that way, so the prefix
/// comes off. It stays when a part ends in `.` or a space, or is a device
/// name such as `NUL`: without the prefix, Windows would drop the dot or the
/// space, or name the device, and so name something other than the folder.
pub(crate) fn for_git(path: &Path) -> OsString {
    if cfg!(windows)
        && let Some(plain) = path.to_str().and_then(without_long_path_prefix)
    {
        return plain.into();
    }
    path.as_os_str().to_owned()
}

/// The path with the long-path prefix taken off (`\\?\UNC\` becomes `\\`),
/// or `None` if the path has no such prefix before a drive or a network
/// path, or has a part that ends in `.` or a space or is a device name.
fn without_long_path_prefix(path: &str) -> Option<String> {
    let plain = if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else {
        let rest = path.strip_prefix(r"\\?\")?;
        let has_drive =
            matches!(rest.as_bytes(), [letter, b':', b'\\', ..] if letter.is_ascii_alphabetic());
        if !has_drive {
            return None;
        }
        rest.to_owned()
    };
    let parts_keep_their_names = plain
        .split('\\')
        .all(|part| !part.ends_with(['.', ' ']) && !is_device_name(part));
    parts_keep_their_names.then_some(plain)
}

/// Whether Windows reads the path part as a device, such as `nul` or
/// `COM1.txt`, when the path has no long-path prefix.
fn is_device_name(part: &str) -> bool {
    let stem = part.split('.').next().unwrap_or(part).trim_end();
    let upper = stem.to_ascii_uppercase();
    let numbered = ["COM", "LPT"].iter().any(|kind| {
        upper.strip_prefix(kind).is_some_and(|number| {
            matches!(number, "\u{b9}" | "\u{b2}" | "\u{b3}")
                || (number.len() == 1 && number.bytes().all(|digit| digit.is_ascii_digit()))
        })
    });
    numbered
        || matches!(
            upper.as_str(),
            "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
        )
}

#[cfg(test)]
mod tests {
    use super::without_long_path_prefix;

    #[test]
    fn opened_folders_gives_git_paths_without_the_long_path_prefix() {
        let cases = [
            (r"\\?\C:\acme\notes\.git", Some(r"C:\acme\notes\.git")), // leak-guard: allow absolute-path Windows path forms under test
            (r"\\?\UNC\server\share\notes", Some(r"\\server\share\notes")),
            // Without the prefix, Windows would drop the dot and the space.
            (r"\\?\C:\acme\notes.", None), // leak-guard: allow absolute-path Windows path forms under test
            (r"\\?\C:\notes \x", None), // leak-guard: allow absolute-path Windows path forms under test
            // Without the prefix, Windows would name a device.
            (r"\\?\C:\acme\nul\.git", None), // leak-guard: allow absolute-path Windows path forms under test
            (r"\\?\C:\acme\Com1.txt", None), // leak-guard: allow absolute-path Windows path forms under test
            (r"\\?\C:\acme\com¹", None), // leak-guard: allow absolute-path Windows path forms under test
            (r"\\?\C:\acme\console", Some(r"C:\acme\console")), // leak-guard: allow absolute-path Windows path forms under test
            (r"\\?\Volume{1234}\notes", None),
            (r"C:\acme", None), // leak-guard: allow absolute-path Windows path forms under test
        ];
        for (path, plain) in cases {
            assert_eq!(without_long_path_prefix(path).as_deref(), plain, "{path}");
        }
    }
}
