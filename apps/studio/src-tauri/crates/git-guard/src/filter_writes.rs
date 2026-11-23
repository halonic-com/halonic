//! Refuses a call that would store or write files without the filter their
//! attributes name (requirement `filter-writes`).
//!
//! The runner blanks every filter driver the repository's config defines,
//! and outside trusted folders the user's own too (see `trusted_filters.rs`),
//! so such a filter doesn't run. A call that only reads, such as `status`
//! or `diff`, still answers truly. A call that stores a file, such as `add`,
//! would store it as it is, and one that writes the working tree, such as
//! `checkout` or `pull`, would write it as stored: a large file instead of
//! a git-lfs pointer, or the plain text a git-crypt filter would encrypt.
//! So before
//! such a call the runner reads the attribute files and refuses it when one
//! of them names a blanked filter, before git starts, so nothing is half
//! written.
//!
//! It looks for `filter=<name>` in the files' text rather than at the paths
//! the call touches: a `pull` or a `checkout` brings in files no path names
//! yet, and a macro or a pattern in any attribute file can pick the filter.
//! That refuses some calls git could have made without the filter, which
//! costs a terminal command; a commit without it costs more. When every
//! filter it names is the user's own and only the folder's trust is
//! missing, the refusal says so, since trusting the folder lets them run.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::check_args::CheckedCall;
use crate::error::GitError;
use crate::limited_run::run_limited;
use crate::repo_config::ConfigEntry;
use crate::repository::Repository;
use crate::runner::GitRunner;

/// Every `.gitattributes`, in every folder of a tree, the working tree or
/// the index.
const ATTRIBUTE_FILES: &str = ":(glob)**/.gitattributes";

/// The attribute that picks a filter driver, as attribute files write it.
const FILTER_ATTRIBUTE: &str = "filter=";

/// Options whose value is the next argument, on the subcommands
/// [`passes_content`] looks at: `commit -m`, `checkout -b` and `-B`, and
/// `switch -c` and `-C`.
const SEPARATE_VALUE_OPTIONS: &[&str] = &["-m", "-b", "-B", "-c", "-C"];

/// The config key naming a tree git reads attributes from instead of the
/// working tree and the index (git 2.46 and later).
const ATTRIBUTE_TREE: &str = "attr.tree";

/// Whether the call stores files or writes them into the working tree, so
/// a blanked filter would change what it stores or writes: `add`, a
/// `commit` that names paths, `reset --hard`, `pull`, and a `checkout` or
/// `switch` that names a revision or paths rather than only a new branch.
/// A plain `commit` stores the index as it is; `rm`, `clean`, a `reset`
/// without `--hard` and the allowed `merge -s ours` write no file's content.
pub(crate) fn passes_content(call: &CheckedCall) -> bool {
    let args = call.args().get(1..).unwrap_or_default();
    match call.subcommand() {
        "add" => !options(args).any(|option| option == "--dry-run"),
        "reset" => options(args).any(|option| option == "--hard"),
        "pull" => true,
        "commit" | "checkout" | "switch" => !positional(args).0.is_empty(),
        _ => false,
    }
}

/// The revisions whose attribute files the call brings in: those it names
/// before `--` for `checkout`, `switch` and `reset`, and for `pull` the
/// upstream and the branches it names, as they were last fetched.
/// Arguments that are paths don't resolve and are skipped later.
fn target_revisions(call: &CheckedCall) -> Vec<String> {
    let args = call.args().get(1..).unwrap_or_default();
    match call.subcommand() {
        "checkout" | "switch" | "reset" => positional(args).1,
        "pull" => pulled_revisions(&positional(args).0),
        _ => Vec::new(),
    }
}

/// For `pull [<remote> [<refspec>…]]`, the upstream and each named
/// branch's remote-tracking ref: `main`, `+main` or `main:topic` read
/// `refs/remotes/<remote>/main`. The allow-list lets only a remote's name,
/// never a URL, stand for the remote.
fn pulled_revisions(arguments: &[String]) -> Vec<String> {
    let mut revisions = vec!["@{upstream}".to_owned()];
    let Some((remote, refspecs)) = arguments.split_first() else {
        return revisions;
    };
    for refspec in refspecs {
        let source = refspec.trim_start_matches('+');
        let source = source.split(':').next().unwrap_or_default();
        let branch = source.strip_prefix("refs/heads/").unwrap_or(source);
        if !branch.is_empty() {
            revisions.push(format!("refs/remotes/{remote}/{branch}"));
        }
    }
    revisions
}

/// The options before `--`.
fn options(args: &[String]) -> impl Iterator<Item = &str> {
    args.iter()
        .take_while(|arg| *arg != "--")
        .map(String::as_str)
        .filter(|arg| arg.starts_with('-'))
}

/// The arguments that aren't options or their values, and of those the
/// ones before `--`, which may be revisions.
fn positional(args: &[String]) -> (Vec<String>, Vec<String>) {
    let mut all = Vec::new();
    let mut before_paths = Vec::new();
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        if arg == "--" {
            all.extend(rest.by_ref().cloned());
            break;
        }
        if SEPARATE_VALUE_OPTIONS.contains(&arg.as_str()) {
            rest.next();
        } else if !arg.starts_with('-') {
            all.push(arg.clone());
            before_paths.push(arg.clone());
        }
    }
    (all, before_paths)
}

/// The first of `filters` that an attribute file's `text` names, in a
/// pattern's attributes or in a macro. Comments don't count, nor do
/// `-filter`, `!filter` or a bare `filter`, which name no driver.
pub(crate) fn named_filter(text: &str, filters: &[String]) -> Option<String> {
    text.lines()
        .map(str::trim_start)
        .filter(|line| !line.starts_with('#'))
        .flat_map(str::split_whitespace)
        .filter_map(|token| token.strip_prefix(FILTER_ATTRIBUTE))
        .find(|name| filters.iter().any(|filter| filter == name))
        .map(str::to_owned)
}

/// The filters a call runs without: every blanked one, and of those the
/// ones blanked even in a trusted folder, which a repository's own config
/// defines.
#[derive(Clone, Copy)]
pub(crate) struct Blanked<'a> {
    pub(crate) filters: &'a [String],
    pub(crate) always: &'a [String],
}

impl GitRunner {
    /// Refuses `call` with `filter_not_run` when it passes content (see
    /// [`passes_content`]) and an attribute file git would read names one
    /// of the blanked filters: every `.gitattributes` in the working tree
    /// and the index, in the revisions the call brings in and in the
    /// `attr.tree` the config names, then `info/attributes` and the user's
    /// own attributes file. It names a filter trust can't bring back first,
    /// so `trust_runs` says whether trusting the folder would let every
    /// named filter run.
    pub(crate) fn check_filter_writes(
        &self,
        repository: &Repository,
        entries: &[ConfigEntry],
        blanked: Blanked<'_>,
        call: &CheckedCall,
        deadline: Instant,
    ) -> Result<(), GitError> {
        if blanked.filters.is_empty() || !passes_content(call) {
            return Ok(());
        }
        let texts = self.attribute_texts(repository, entries, call, deadline)?;
        let named = |filters: &[String]| texts.iter().find_map(|text| named_filter(text, filters));
        let (filter, trust_runs) = match named(blanked.always) {
            Some(filter) => (filter, false),
            None => match named(blanked.filters) {
                Some(filter) => (filter, true),
                None => return Ok(()),
            },
        };
        Err(GitError::FilterNotRun {
            subcommand: call.subcommand().to_owned(),
            filter,
            trust_runs,
        })
    }

    /// The `filter=` lines of every attribute file git would read for
    /// `call`, and the whole text of `info/attributes` and the user's own
    /// attributes file.
    fn attribute_texts(
        &self,
        repository: &Repository,
        entries: &[ConfigEntry],
        call: &CheckedCall,
        deadline: Instant,
    ) -> Result<Vec<String>, GitError> {
        let mut sources = vec!["--untracked".to_owned(), "--cached".to_owned()];
        let mut revisions = target_revisions(call);
        revisions.extend(attribute_tree(entries));
        for revision in revisions {
            sources.extend(self.resolve_tree(repository, &revision, deadline)?);
        }
        let mut texts = Vec::new();
        for source in sources {
            texts.push(self.grep_attribute_files(repository, &source, deadline)?);
        }
        let mut files = vec![repository.common_dir.join("info").join("attributes")];
        files.extend(self.user_attributes_file(repository, deadline)?);
        let limit = self.limits().max_output_bytes;
        for file in files {
            texts.push(read_attribute_file(&file, limit)?);
        }
        Ok(texts)
    }

    /// The lines of every `.gitattributes` in `source` (`--untracked` for
    /// the working tree, `--cached` for the index, or a tree's id) that
    /// hold `filter=`. Colours, line numbers and file names are turned off,
    /// whatever the config says, so each line is the file's own text.
    fn grep_attribute_files(
        &self,
        repository: &Repository,
        source: &str,
        deadline: Instant,
    ) -> Result<String, GitError> {
        let args = [
            "grep",
            "--no-color",
            "--no-line-number",
            "--no-column",
            "-h",
            "--text",
            "--fixed-strings",
            "-e",
            FILTER_ATTRIBUTE,
            source,
            "--",
            ATTRIBUTE_FILES,
        ];
        let mut command = self.base_command(&repository.top, Some(repository), &[]);
        // The one pattern the runner itself gives, so this call alone may
        // use `:(glob)`.
        command.env_remove("GIT_LITERAL_PATHSPECS").args(args);
        let output = run_limited(&mut command, deadline, self.limits().max_output_bytes)?;
        // 1 is git grep's "nothing found".
        match output.code {
            Some(0 | 1) => Ok(String::from_utf8_lossy(&output.stdout).into_owned()),
            _ => Err(GitError::RepositoryUnreadable),
        }
    }

    /// The tree `revision` names, or nothing when it names none, as a path
    /// or an upstream not fetched yet doesn't.
    fn resolve_tree(
        &self,
        repository: &Repository,
        revision: &str,
        deadline: Instant,
    ) -> Result<Option<String>, GitError> {
        if revision.starts_with('-') {
            return Ok(None);
        }
        let tree = format!("{revision}^{{tree}}");
        let args = ["rev-parse", "--verify", "--quiet", tree.as_str()];
        let output = self.run_internal(&repository.top, Some(repository), &args, deadline)?;
        let id = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        Ok((output.code == Some(0) && !id.is_empty()).then_some(id))
    }

    /// The user's own attributes file: `core.attributesFile`, or git's
    /// default under `$XDG_CONFIG_HOME` or `~/.config`. A relative
    /// `core.attributesFile` is read from the top of the working tree, where
    /// git runs, not from the shell's own folder.
    fn user_attributes_file(
        &self,
        repository: &Repository,
        deadline: Instant,
    ) -> Result<Option<PathBuf>, GitError> {
        let args = ["config", "--path", "--get", "core.attributesFile"];
        let output = self.run_internal(&repository.top, Some(repository), &args, deadline)?;
        match output.code {
            Some(0) => {
                let path = String::from_utf8_lossy(&output.stdout);
                let path = path.trim_end_matches(['\n', '\r']);
                // An empty value names no file.
                Ok((!path.is_empty()).then(|| repository.top.join(path)))
            }
            // 1 is git config's "not set".
            Some(1) => Ok(default_user_attributes_file()),
            _ => Err(GitError::RepositoryUnreadable),
        }
    }
}

/// The tree the config's `attr.tree` names, the last one set.
fn attribute_tree(entries: &[ConfigEntry]) -> Option<String> {
    entries
        .iter()
        .rev()
        .find(|entry| entry.key.eq_ignore_ascii_case(ATTRIBUTE_TREE))
        .map(|entry| entry.value.clone())
}

/// git's default for the user's attributes file.
fn default_user_attributes_file() -> Option<PathBuf> {
    let non_empty = |name| std::env::var_os(name).filter(|value| !value.is_empty());
    if let Some(config) = non_empty("XDG_CONFIG_HOME") {
        return Some(Path::new(&config).join("git").join("attributes"));
    }
    let home = non_empty("HOME").or_else(|| non_empty("USERPROFILE"))?;
    Some(
        Path::new(&home)
            .join(".config")
            .join("git")
            .join("attributes"),
    )
}

/// An attribute file's text, read inside the shell's own process, so with
/// the limits a git process gets. A missing or unreadable file gives none:
/// git skips it too, so it picks no filter. The path is the repository's to
/// choose (`core.attributesFile` can come from its config, and
/// `info/attributes` can be a link), so anything but a regular file, such as
/// a FIFO that would block the read forever or a device that never ends, and
/// a file over `limit` bytes refuse the call with `repository_unreadable`
/// rather than pass it unread.
pub(crate) fn read_attribute_file(file: &Path, limit: usize) -> Result<String, GitError> {
    // `metadata` follows links and opens nothing, so a FIFO is caught before
    // an open that would wait for a writer.
    match std::fs::metadata(file) {
        Ok(metadata) if metadata.is_file() => {}
        Ok(_) => return Err(GitError::RepositoryUnreadable),
        Err(_) => return Ok(String::new()),
    }
    let Ok(opened) = open_without_waiting(file) else {
        return Ok(String::new());
    };
    // A FIFO swapped in since the look doesn't hold the open up, and is
    // refused here; the read is capped anyway.
    if !opened.metadata().is_ok_and(|metadata| metadata.is_file()) {
        return Err(GitError::RepositoryUnreadable);
    }
    let mut bytes = Vec::new();
    let cap = u64::try_from(limit).unwrap_or(u64::MAX).saturating_add(1);
    if opened.take(cap).read_to_end(&mut bytes).is_err() {
        return Ok(String::new());
    }
    if bytes.len() > limit {
        return Err(GitError::RepositoryUnreadable);
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Opens a file to read, following links as git does. On Unix the open
/// doesn't wait for a FIFO's writer (`O_NONBLOCK`); a regular file reads
/// as usual with it.
#[cfg(unix)]
fn open_without_waiting(file: &Path) -> std::io::Result<std::fs::File> {
    use std::os::unix::fs::OpenOptionsExt;
    std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NONBLOCK)
        .open(file)
}

/// Opens a file to read. Windows has no FIFO in the file system to wait on.
#[cfg(not(unix))]
fn open_without_waiting(file: &Path) -> std::io::Result<std::fs::File> {
    std::fs::File::open(file)
}

#[cfg(test)]
#[path = "filter_writes_tests.rs"]
mod tests;
