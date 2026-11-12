//! Where a connector's program is on this computer (HAL-7876). The same
//! rules as `findCommand` in `apps/cli/src/command-paths.ts`, so the Studio
//! and the CLI compute one trust fingerprint for one workspace.

use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

/// Where the system would start `command` from: the first program of that
/// name in an absolute folder of `path`, or `None` when there is none or the
/// command holds a folder. `endings` are Windows' `PATHEXT` entries, empty
/// elsewhere.
pub fn find_command(command: &str, path: &OsStr, endings: &[String]) -> Option<PathBuf> {
    if command.is_empty() || command.contains(['/', '\\']) {
        return None;
    }
    let names = candidate_names(command, endings);
    std::env::split_paths(path)
        .filter(|folder| folder.is_absolute())
        .flat_map(|folder| names.iter().map(move |name| folder.join(name)))
        .find(|candidate| is_program(candidate))
}

/// The path of each command found, by the command as written. A command
/// that isn't found, or whose path isn't valid Unicode, is left out.
pub fn find_commands(
    commands: &[String],
    path: &OsStr,
    endings: &[String],
) -> BTreeMap<String, String> {
    commands
        .iter()
        .filter_map(|command| {
            let found = find_command(command, path, endings)?;
            Some((command.clone(), found.into_os_string().into_string().ok()?))
        })
        .collect()
}

/// The file names `command` can start: itself where there are no endings;
/// with endings, itself with each ending in lower case, or only itself when
/// it already has one.
fn candidate_names(command: &str, endings: &[String]) -> Vec<String> {
    if endings.is_empty() {
        return vec![command.to_owned()];
    }
    let lower = command.to_lowercase();
    if endings
        .iter()
        .any(|ending| lower.ends_with(&ending.to_lowercase()))
    {
        return vec![command.to_owned()];
    }
    endings
        .iter()
        .map(|ending| format!("{command}{}", ending.to_lowercase()))
        .collect()
}

fn is_program(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}
