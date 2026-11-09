//! Reads the config listing the runner takes before every call (requirement
//! `git-hardening`): it shows that git took the runner's own config, and,
//! in the next part of the stack, what the repository's config names.

use crate::error::GitError;

/// One entry of the config listing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ConfigEntry {
    pub scope: String,
    /// The key as git writes it: section and name in lower case, the
    /// subsection as it is.
    pub key: String,
    pub value: String,
}

/// Reads the output of `git config --list --show-scope --includes -z`.
pub(crate) fn parse_listing(listing: &[u8]) -> Vec<ConfigEntry> {
    let mut entries = Vec::new();
    let mut fields = listing.split(|byte| *byte == 0);
    while let (Some(scope), Some(entry)) = (fields.next(), fields.next()) {
        // A key and its value are split by the first newline; a key with no
        // value at all has none.
        let (key, value) = match entry.iter().position(|byte| *byte == b'\n') {
            Some(newline) => (&entry[..newline], &entry[newline + 1..]),
            None => (entry, &[][..]),
        };
        entries.push(ConfigEntry {
            scope: String::from_utf8_lossy(scope).into_owned(),
            key: String::from_utf8_lossy(key).into_owned(),
            value: String::from_utf8_lossy(value).into_owned(),
        });
    }
    entries
}

/// Refuses a listing git could not give: without it, the runner can't know
/// what the repository's config names.
pub(crate) fn check_listing(code: Option<i32>) -> Result<(), GitError> {
    match code {
        Some(0) => Ok(()),
        _ => Err(GitError::RepositoryUnreadable),
    }
}

/// Whether the listing shows the runner's own config, given in the
/// environment. git before 2.31 ignores config given that way, and then
/// none of the hardening would hold.
pub(crate) fn has_command_entry(entries: &[ConfigEntry], key: &str) -> bool {
    entries
        .iter()
        .any(|entry| entry.scope == "command" && entry.key.eq_ignore_ascii_case(key))
}

#[cfg(test)]
#[path = "repo_config_tests.rs"]
mod tests;
