//! Where a repository's files are, checked against the opened folders
//! (requirement `opened-folders`).
//!
//! A repository's top folder is not all of it. A `.git` file can point at a
//! git folder anywhere (`gitdir: /elsewhere/.git`), a `commondir` file at
//! another repository's objects and refs, and `objects/info/alternates` at
//! more objects. Each of them must be inside an opened folder too, or
//! `log -p`, `reset --hard` and `push` would work on another repository.
//! The links inside those folders are checked in [`crate::git_folder_links`].

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::error::GitError;
use crate::git_folder_links::Links;
use crate::opened_folders::{OpenedFolders, canonical};

/// git reads alternates five deep; so does the check.
const MAX_ALTERNATE_DEPTH: usize = 5;

/// The checked folders of a repository, all canonical and inside an opened
/// folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Repository {
    pub top: PathBuf,
    pub git_dir: PathBuf,
    pub common_dir: PathBuf,
}

/// The arguments that ask git where the repository's folders are.
pub(crate) const LOCATE_ARGS: &[&str] = &[
    "rev-parse",
    "--path-format=absolute",
    "--show-toplevel",
    "--git-dir",
    "--git-common-dir",
];

/// Reads the answer to [`LOCATE_ARGS`] and checks every folder in it, the
/// links inside the git folders, and the alternates, against the opened
/// folders.
pub(crate) fn check_located(
    folders: &OpenedFolders,
    stdout: &[u8],
    deadline: Instant,
) -> Result<Repository, GitError> {
    // git ends each path with a newline, and on Windows writes it with `/`.
    let mut lines = stdout
        .split(|byte| *byte == b'\n')
        .map(|line| line.strip_suffix(b"\r").unwrap_or(line));
    let mut next_folder = || -> Result<PathBuf, GitError> {
        let line = lines.next().ok_or(GitError::FolderUnreadable)?;
        let path = path_from_git(line)?;
        // Asked for absolute paths, git gives nothing else; anything else
        // would be read against the shell's own folder.
        if !path.is_absolute() {
            return Err(GitError::FolderUnreadable);
        }
        let folder = canonical(&path)?;
        if !folders.contains_canonical(&folder) {
            return Err(GitError::FolderNotOpened);
        }
        Ok(folder)
    };
    let repository = Repository {
        top: next_folder()?,
        git_dir: next_folder()?,
        common_dir: next_folder()?,
    };
    let mut links = Links::new(folders, deadline);
    links.check_git_folder(&repository.git_dir)?;
    if repository.common_dir != repository.git_dir {
        links.check_git_folder(&repository.common_dir)?;
    }
    let objects = repository.common_dir.join("objects");
    check_alternates(folders, &mut links, &objects, 0)?;
    Ok(repository)
}

/// Checks every folder an `objects/info/alternates` file names, and theirs
/// in turn, with the links inside them. Relative entries are relative to
/// the objects folder.
fn check_alternates(
    folders: &OpenedFolders,
    links: &mut Links<'_>,
    objects: &Path,
    depth: usize,
) -> Result<(), GitError> {
    let file = objects.join("info").join("alternates");
    let contents = match std::fs::read(&file) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(GitError::FolderUnreadable),
    };
    for line in contents.split(|byte| *byte == b'\n') {
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        if line.is_empty() || line.starts_with(b"#") {
            continue;
        }
        // Past git's depth an alternate is ignored by git, but it is still
        // refused here: nothing outside the opened folders is read.
        let alternate = canonical_alternate(&file, &objects.join(path_from_git(line)?))?;
        if !folders.contains_canonical(&alternate) {
            return Err(GitError::FolderNotOpened);
        }
        links.check_canonical_folder(alternate.clone())?;
        if depth < MAX_ALTERNATE_DEPTH {
            check_alternates(folders, links, &alternate, depth + 1)?;
        }
    }
    Ok(())
}

/// The canonical folder an alternates file names. A missing one gets its
/// own error, naming the file and the line to fix: git would only warn and
/// carry on without those objects.
fn canonical_alternate(file: &Path, alternate: &Path) -> Result<PathBuf, GitError> {
    match std::fs::metadata(alternate) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Err(GitError::AlternateMissing {
                file: file.display().to_string(),
                alternate: alternate.display().to_string(),
            })
        }
        _ => canonical(alternate),
    }
}

/// The paths of the gitlinks (submodules and other repositories added as
/// one) in the output of `ls-files --stage -z`, relative to the top folder.
pub(crate) fn gitlinks(listing: &[u8]) -> Result<Vec<PathBuf>, GitError> {
    let mut paths = Vec::new();
    for entry in listing.split(|byte| *byte == 0) {
        // `<mode> <object> <stage>\t<path>`; a gitlink's mode is 160000.
        let Some(rest) = entry.strip_prefix(b"160000 ") else {
            continue;
        };
        let Some(tab) = rest.iter().position(|byte| *byte == b'\t') else {
            continue;
        };
        paths.push(path_from_git(&rest[tab + 1..])?);
    }
    Ok(paths)
}

/// A path as git wrote it: raw bytes on Unix, where a file name need not be
/// UTF-8, and UTF-8 on Windows.
pub(crate) fn path_from_git(bytes: &[u8]) -> Result<PathBuf, GitError> {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStringExt;
        Ok(PathBuf::from(OsString::from_vec(bytes.to_vec())))
    }
    #[cfg(not(unix))]
    {
        String::from_utf8(bytes.to_vec())
            .map(|text| PathBuf::from(OsString::from(text)))
            .map_err(|_| GitError::FolderUnreadable)
    }
}

#[cfg(test)]
mod tests {
    use super::gitlinks;
    use std::path::PathBuf;

    #[test]
    fn opened_folders_finds_the_gitlinks_in_the_index() {
        let listing =
            b"100644 1111 0\tnotes.md\x00160000 2222 0\tvendor/acme\x00160000 3333 0\twith\ttab\0";
        assert_eq!(
            gitlinks(listing),
            Ok(vec![
                PathBuf::from("vendor/acme"),
                PathBuf::from("with\ttab")
            ])
        );
    }
}
