//! Paths in the form the person's system writes them: `\` on Windows, `/`
//! elsewhere. A port of `native-path.ts` in `@halonicjs/profile`, kept as
//! text so both give the same answer character for character.

use crate::Platform;

impl Platform {
    /// The separator the platform writes between folders.
    pub fn separator(self) -> char {
        match self {
            Platform::Windows => '\\',
            Platform::Macos | Platform::Linux => '/',
        }
    }
}

/// Whether a path starts at a root: `/` on macOS and Linux; a drive (`C:\`)
/// or a network share (`\\server\share`) on Windows. A Windows path with
/// only a drive letter (`C:halonic`) is relative to that drive's current
/// folder, so it doesn't count.
pub fn is_absolute_path(platform: Platform, path: &str) -> bool {
    if platform != Platform::Windows {
        return path.starts_with('/');
    }
    let separator = |character: &char| is_separator(platform, *character);
    let start: Vec<char> = path.chars().take(3).collect();
    match start.as_slice() {
        [letter, ':', third] => letter.is_ascii_alphabetic() && separator(third),
        [first, second, third] => separator(first) && separator(second) && !separator(third),
        _ => false,
    }
}

/// Joins a folder and names below it with the platform's separator.
/// Trailing separators on the folder are dropped; a root such as `/` or
/// `C:\` keeps its own.
pub fn join_path(platform: Platform, folder: &str, names: &[&str]) -> String {
    let separator = platform.separator();
    let mut joined = without_trailing_separators(platform, folder);
    for name in names {
        if !joined.ends_with(separator) {
            joined.push(separator);
        }
        joined.push_str(name);
    }
    joined
}

/// A folder without the separators at its end, except a root's own: `/`
/// stays `/`, and `C:\` stays `C:\`.
pub fn without_trailing_separators(platform: Platform, folder: &str) -> String {
    let mut trimmed = folder;
    while trimmed.len() > 1 {
        let Some(shorter) = trimmed.strip_suffix(|end| is_separator(platform, end)) else {
            break;
        };
        trimmed = shorter;
    }
    let is_bare_drive = trimmed.len() == 2
        && trimmed.ends_with(':')
        && trimmed.starts_with(|first: char| first.is_ascii_alphabetic());
    if platform == Platform::Windows && is_bare_drive {
        return format!("{trimmed}\\");
    }
    trimmed.to_owned()
}

/// Whether a character separates folders on the platform: `/` everywhere,
/// and `\` on Windows too.
fn is_separator(platform: Platform, character: char) -> bool {
    character == '/' || (platform == Platform::Windows && character == '\\')
}
