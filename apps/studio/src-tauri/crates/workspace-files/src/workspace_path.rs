//! The path rules of the `DefinitionSource` port, as `checkWorkspacePath`,
//! `checkPublicWorkspacePath`, `isPrivateWorkspacePath` and
//! `segmentAsOpened` in `packages/core/ports/src/definition-store.ts` have
//! them. Both sides are tested against
//! `packages/core/ports/src/golden/workspace-paths.json`.

use crate::error::FileError;

/// Refuses a path the port calls unsafe: one that is absolute, has a `.`,
/// `..` or empty segment, or contains a backslash or NUL. Checked before the
/// folder is touched, so `a/./b` can never mean `a/b`.
pub fn check_workspace_path(path: &str) -> Result<(), FileError> {
    let unsafe_path = |reason| FileError::UnsafePath {
        path: path.to_owned(),
        reason,
    };
    if path.contains('\\') || path.contains('\0') {
        return Err(unsafe_path("no backslash or NUL"));
    }
    if path.starts_with('/') {
        return Err(unsafe_path("it must be relative"));
    }
    if path
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err(unsafe_path("no empty, \".\" or \"..\" segment"));
    }
    Ok(())
}

/// Refuses an unsafe path, as [`check_workspace_path`] does, and also a
/// private one (see [`is_private_workspace_path`]). Every call that takes a
/// path checks it with this.
pub fn check_public_workspace_path(path: &str) -> Result<(), FileError> {
    check_workspace_path(path)?;
    if is_private_workspace_path(path) {
        return Err(FileError::PrivatePath {
            path: path.to_owned(),
        });
    }
    Ok(())
}

/// Whether a safe path has a private segment: after
/// [`segment_as_opened`], `.git`, `.studio`, `.env`, `.envrc` or `.env.` and
/// more; or, whatever its name, a segment with a `:` (an NTFS stream) or a
/// `~` followed by a digit (an 8.3 short name).
pub fn is_private_workspace_path(path: &str) -> bool {
    path.split('/').any(is_private_segment)
}

/// A path segment the way Windows and macOS would open it: without the code
/// points HFS+ ignores, with case folded as any file system might fold it,
/// and without trailing dots and spaces.
pub fn segment_as_opened(segment: &str) -> String {
    let kept: String = segment.chars().filter(|&c| !is_hfs_ignored(c)).collect();
    // Upper case first, so letters that fold to ASCII on some file system
    // match too: a long s to `s`, an `st` ligature to `st`, a dotless i to `i`.
    kept.to_uppercase()
        .to_lowercase()
        .trim_end_matches(['.', ' '])
        .to_owned()
}

/// Code points HFS+ ignores in a name, as in git's `next_hfs_char`.
fn is_hfs_ignored(c: char) -> bool {
    matches!(
        c,
        '\u{200C}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{206A}'..='\u{206F}' | '\u{FEFF}'
    )
}

fn is_private_segment(segment: &str) -> bool {
    if segment.contains(':') || has_short_name_mark(segment) {
        return true;
    }
    let name = segment_as_opened(segment);
    name == ".git"
        || name == ".studio"
        || name == ".env"
        || name == ".envrc"
        || name.starts_with(".env.")
}

/// A `~` followed by an ASCII digit, as `/~\d/u` matches in TypeScript.
fn has_short_name_mark(segment: &str) -> bool {
    segment
        .as_bytes()
        .windows(2)
        .any(|pair| pair[0] == b'~' && pair[1].is_ascii_digit())
}
