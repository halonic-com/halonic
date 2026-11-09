//! Neutralises the programs a repository's own config names (requirement
//! `repo-config`).
//!
//! Anyone who can write the opened folder can write `.git/config`, so no
//! program named there may run. Refusing such repositories would leave the
//! user unable to use git in a cloned repository that names one, and would
//! miss the keys new git releases add. So the runner lists the config with
//! its scopes and, for every entry from the repository itself, overrides
//! what it names: filters are blanked, merge drivers report a conflict, and
//! the ssh and signing programs go back to the user's own or git's default.
//! The rest is neutralised on every call (see `runner.rs`): hooks, pagers,
//! editors, diff drivers, signing, upload-pack, receive-pack and transports.
//! Only a key no override reaches makes the runner refuse the repository.

use crate::error::GitError;

/// Scopes that come from the repository itself.
const REPOSITORY_SCOPES: &[&str] = &["local", "worktree"];

/// Keys naming one program each, with the value git uses when none is set.
/// A repository's value is replaced by the last one from outside it, from
/// the user's own config, or else by this default.
const PROGRAM_KEYS: &[(&str, &str)] = &[
    ("core.sshcommand", "ssh"),
    ("gpg.program", "gpg"),
    ("gpg.openpgp.program", "gpg"),
    ("gpg.x509.program", "gpgsm"),
    ("gpg.ssh.program", "ssh-keygen"),
    ("gpg.ssh.defaultkeycommand", ""),
];

/// A merge driver that always reports a conflict, so the user resolves it.
/// git runs merge drivers through its shell, which has `exit` built in.
const CONFLICT_MERGE_DRIVER: &str = "exit 1";

/// One entry of the config listing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ConfigEntry {
    pub scope: String,
    /// The key as git writes it: section and name in lower case, the
    /// subsection as it is.
    pub key: String,
    pub value: String,
}

impl ConfigEntry {
    fn is_from_repository(&self) -> bool {
        REPOSITORY_SCOPES.contains(&self.scope.as_str())
    }
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

/// Refuses a repository whose own config sets `branch.<name>.mergeOptions`.
/// The `git merge` that `pull` runs reads it as options, so `-F <file>`
/// would make any file the merge commit's message, ready to be pushed. An
/// empty value in the runner's config doesn't override it (tested with
/// 2.47), so the repository is refused rather than neutralised.
pub(crate) fn check_refused_keys(entries: &[ConfigEntry]) -> Result<(), GitError> {
    let refused = entries.iter().find(|entry| {
        entry.is_from_repository()
            && subsection_key(&entry.key, "branch")
                .is_some_and(|(_, name)| name.eq_ignore_ascii_case("mergeoptions"))
    });
    match refused {
        Some(entry) => Err(GitError::ConfigNotAllowed {
            key: entry.key.clone(),
        }),
        None => Ok(()),
    }
}

/// Adds the names of the filter drivers a repository's own config defines.
pub(crate) fn add_repository_filters(entries: &[ConfigEntry], names: &mut Vec<String>) {
    for entry in entries.iter().filter(|entry| entry.is_from_repository()) {
        if let Some((name, _)) = subsection_key(&entry.key, "filter")
            && !names.iter().any(|known| known == name)
        {
            names.push(name.to_owned());
        }
    }
}

/// The config that blanks the given filter drivers. A blank command is no
/// filter at all: the content goes in and out as it is.
pub(crate) fn blank_filters(names: &[String]) -> Vec<(String, String)> {
    let mut overrides = Vec::new();
    for name in names {
        for key in ["clean", "smudge", "process"] {
            overrides.push((format!("filter.{name}.{key}"), String::new()));
        }
        overrides.push((format!("filter.{name}.required"), "false".to_owned()));
    }
    overrides
}

/// The config that neutralises every other program the repository's own
/// config names: its merge drivers, its credential helpers, and the keys in
/// [`PROGRAM_KEYS`].
pub(crate) fn neutralise_programs(entries: &[ConfigEntry]) -> Vec<(String, String)> {
    let repository = || entries.iter().filter(|entry| entry.is_from_repository());
    let mut overrides: Vec<(String, String)> = Vec::new();
    for entry in repository() {
        if let Some((name, "driver")) = subsection_key(&entry.key, "merge") {
            let key = format!("merge.{name}.driver");
            if !overrides.iter().any(|(known, _)| *known == key) {
                overrides.push((key, CONFLICT_MERGE_DRIVER.to_owned()));
            }
        }
    }
    for (key, default) in PROGRAM_KEYS {
        if repository().any(|entry| entry.key.eq_ignore_ascii_case(key)) {
            let outside = entries
                .iter()
                .rev()
                .find(|entry| !entry.is_from_repository() && entry.key.eq_ignore_ascii_case(key))
                .map_or(*default, |entry| entry.value.as_str());
            overrides.push(((*key).to_owned(), outside.to_owned()));
        }
    }
    if repository().any(|entry| is_credential_helper(&entry.key)) {
        // A blank helper empties the list git has built so far, from every
        // file. The user's own helpers then go back on, in their order.
        overrides.push(("credential.helper".to_owned(), String::new()));
        for entry in entries
            .iter()
            .filter(|entry| !entry.is_from_repository() && is_credential_helper(&entry.key))
        {
            overrides.push((entry.key.clone(), entry.value.clone()));
        }
    }
    overrides
}

/// `credential.helper` and `credential.<url>.helper`.
fn is_credential_helper(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    lower.starts_with("credential.") && lower.ends_with(".helper")
}

/// Splits `<section>.<subsection>.<name>` for the given section, case
/// aside. The subsection may itself hold dots.
fn subsection_key<'a>(key: &'a str, section: &str) -> Option<(&'a str, &'a str)> {
    let (found, rest) = key.split_once('.')?;
    if !found.eq_ignore_ascii_case(section) {
        return None;
    }
    rest.rsplit_once('.')
}

#[cfg(test)]
#[path = "repo_config_tests.rs"]
mod tests;
