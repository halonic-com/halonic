use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

use crate::check_args::{CheckedCall, check_args};
use crate::error::GitError;
use crate::limited_run::{GitOutput, Limits, run_limited};
use crate::opened_folders::{OpenedFolders, canonical, for_git};
use crate::repo_config::{ConfigEntry, check_listing, has_command_entry, parse_listing};
use crate::repository::{LOCATE_ARGS, Repository, check_located};

/// Config the runner gives every call (requirement `git-hardening`), after
/// `core.hooksPath` and before what neutralises the repository's own config. It is given in the environment (`GIT_CONFIG_COUNT`),
/// which beats every config file and, unlike `-c`, takes any key as it is.
/// The user's global config still applies otherwise, because commits need
/// `user.name` and push needs the user's credential helper.
const HARDENING_CONFIG: &[(&str, &str)] = &[
    ("core.fsmonitor", "false"),
    // Signing and checking signatures run the gpg, x509 or ssh signing
    // programs, and `gpg.ssh.defaultKeyCommand`.
    ("commit.gpgSign", "false"),
    ("tag.gpgSign", "false"),
    ("push.gpgSign", "false"),
    ("log.showSignature", "false"),
    ("merge.verifySignatures", "false"),
    // git never goes into a submodule to fetch, check out, push or sum up:
    // there it would read the submodule's own config.
    ("submodule.recurse", "false"),
    ("fetch.recurseSubmodules", "false"),
    ("push.recurseSubmodules", "no"),
    ("status.submoduleSummary", "false"),
    // A cookie file the repository names is never written to.
    ("http.saveCookies", "false"),
];

/// Environment the runner sets after removing every inherited `GIT_*`
/// variable, so nothing interactive can start.
const HARDENING_ENVIRONMENT: &[(&str, &str)] = &[
    ("GIT_TERMINAL_PROMPT", "0"),
    ("GIT_CONFIG_NOSYSTEM", "1"),
    ("GIT_PAGER", "cat"),
    // An editor that changes nothing, so a call that would open one goes
    // on at once instead of waiting.
    ("GIT_EDITOR", "true"),
    ("GIT_SEQUENCE_EDITOR", "true"),
    // Empty: git asks no program for a password, and does not fall back to
    // `core.askPass` or `SSH_ASKPASS`.
    ("GIT_ASKPASS", ""),
    // Only https and ssh, whatever `protocol.*` the config sets. No `ext::`
    // command, and no local remote: git runs a local remote's own hooks and
    // config, which no setting here reaches.
    ("GIT_ALLOW_PROTOCOL", "https:ssh"),
    // Every path is a file name, never a pattern or `:(…)` magic.
    ("GIT_LITERAL_PATHSPECS", "1"),
];

/// The config key whose entry in the listing shows that git took the
/// runner's config at all.
const HOOKS_PATH: &str = "core.hooksPath";

/// Runs allowed git calls, hardened, in opened folders only.
#[derive(Debug)]
pub struct GitRunner {
    git: PathBuf,
    empty_hooks_folder: PathBuf,
    limits: Limits,
}

impl GitRunner {
    /// A runner for the git program at `git`, an absolute path (see
    /// [`crate::find_git`]). `empty_hooks_folder` is created if it is
    /// missing and must stay empty: every call points `core.hooksPath` at
    /// it, so no repository hook ever runs.
    pub fn new(git: PathBuf, empty_hooks_folder: &Path) -> Result<Self, GitError> {
        std::fs::create_dir_all(empty_hooks_folder).map_err(|error| GitError::Io {
            message: error.to_string(),
        })?;
        let empty_hooks_folder = canonical(empty_hooks_folder)?;
        let runner = Self {
            git,
            empty_hooks_folder,
            limits: Limits::default(),
        };
        runner.check_hooks_folder_is_empty()?;
        Ok(runner)
    }

    /// The same runner with other limits.
    pub fn with_limits(self, limits: Limits) -> Self {
        Self { limits, ..self }
    }

    /// Checks a call, then runs it in `root`.
    ///
    /// In order: the arguments against the allow-list, `root` against the
    /// opened folders, the repository's folders against the opened folders,
    /// and the config listing. Only then does the call run, hardened. One
    /// time limit covers all of it.
    pub fn run(
        &self,
        folders: &OpenedFolders,
        root: &Path,
        args: &[String],
    ) -> Result<GitOutput, GitError> {
        let call = check_args(args)?;
        let timeout = if call.uses_network() {
            self.limits.network_timeout
        } else {
            self.limits.local_timeout
        };
        let deadline = Instant::now() + timeout;
        let root = folders.check(root)?;
        self.check_hooks_folder_is_empty()?;
        let repository = match self.check_folder(folders, &root, &call, deadline)? {
            Ok(repository) => repository,
            Err(answer) => return Ok(answer),
        };
        // `init` makes the folder a repository of its own, so git must find
        // it there, not in the folders given by an outer repository.
        let repository = match call.subcommand() {
            "init" => None,
            _ => repository.as_ref(),
        };
        let mut command = self.hardened_command(&root, repository, &call, &[]);
        run_limited(&mut command, deadline, self.limits.max_output_bytes)
    }

    /// Checks the folder a call runs in and the repository it belongs to,
    /// which is `None` for an `init` outside one. Gives git's own answer back
    /// when the folder is not in a repository: `init` goes ahead, and every
    /// other call gets that answer, which is what it would have got anyway.
    fn check_folder(
        &self,
        folders: &OpenedFolders,
        root: &Path,
        call: &CheckedCall,
        deadline: Instant,
    ) -> Result<Result<Option<Repository>, GitOutput>, GitError> {
        let located = self.run_internal(root, None, LOCATE_ARGS, deadline)?;
        if located.code != Some(0) {
            if call.subcommand() != "init" {
                return Ok(Err(located));
            }
            // Outside a repository only the user's own config applies, but
            // git must still show it took the runner's.
            self.read_config(root, None, deadline)?;
            return Ok(Ok(None));
        }
        let repository = check_located(folders, &located.stdout)?;
        self.read_config(root, Some(&repository), deadline)?;
        Ok(Ok(Some(repository)))
    }

    /// Lists the config git would use, refuses a listing git could not
    /// give, and checks that git took the runner's own config.
    fn read_config(
        &self,
        root: &Path,
        repository: Option<&Repository>,
        deadline: Instant,
    ) -> Result<Vec<ConfigEntry>, GitError> {
        let args = ["config", "--list", "--show-scope", "--includes", "-z"];
        let listing = self.run_internal(root, repository, &args, deadline)?;
        check_listing(listing.code)?;
        let entries = parse_listing(&listing.stdout);
        if !has_command_entry(&entries, HOOKS_PATH) {
            return Err(GitError::GitTooOld);
        }
        Ok(entries)
    }

    /// Runs a call of the runner's own, which skips the allow-list.
    fn run_internal(
        &self,
        root: &Path,
        repository: Option<&Repository>,
        args: &[&str],
        deadline: Instant,
    ) -> Result<GitOutput, GitError> {
        let mut command = self.base_command(root, repository, &[]);
        command.args(args);
        run_limited(&mut command, deadline, self.limits.max_output_bytes)
    }

    /// Builds the git command for an allowed call: the base command, then
    /// the subcommand with what neutralises the programs it could run.
    pub(crate) fn hardened_command(
        &self,
        root: &Path,
        repository: Option<&Repository>,
        call: &CheckedCall,
        overrides: &[(String, String)],
    ) -> Command {
        let mut command = self.base_command(root, repository, overrides);
        let Some((subcommand, rest)) = call.args().split_first() else {
            return command;
        };
        command.arg(subcommand);
        if call.shows_diffs() {
            // `diff.external`, `diff.<driver>.command` and `textconv`.
            command.args(["--no-ext-diff", "--no-textconv"]);
        }
        // `remote.<name>.uploadpack` and `receivepack`.
        match subcommand.as_str() {
            "pull" => {
                command.arg("--upload-pack=git-upload-pack");
            }
            "push" => {
                command.arg("--receive-pack=git-receive-pack");
            }
            _ => {}
        }
        command.args(rest);
        command
    }

    /// git with no shell, a clean `GIT_*` environment, the hardening config
    /// and `overrides`, and, in a checked repository, its checked folders,
    /// so a link swapped in after the checks can't move the call.
    fn base_command(
        &self,
        root: &Path,
        repository: Option<&Repository>,
        overrides: &[(String, String)],
    ) -> Command {
        let mut command = Command::new(&self.git);
        command.current_dir(root).stdin(Stdio::null());
        remove_git_variables(&mut command, std::env::vars_os().map(|(name, _)| name));
        command.envs(HARDENING_ENVIRONMENT.iter().copied());
        let mut config: Vec<(OsString, OsString)> =
            vec![(HOOKS_PATH.into(), for_git(&self.empty_hooks_folder))];
        config.extend(
            HARDENING_CONFIG
                .iter()
                .map(|(key, value)| ((*key).into(), (*value).into())),
        );
        config.extend(
            overrides
                .iter()
                .map(|(key, value)| (key.into(), value.into())),
        );
        set_config(&mut command, &config);
        command.arg("--no-pager");
        if let Some(repository) = repository {
            let mut git_dir = OsString::from("--git-dir=");
            git_dir.push(for_git(&repository.git_dir));
            let mut work_tree = OsString::from("--work-tree=");
            work_tree.push(for_git(&repository.top));
            command.arg(git_dir).arg(work_tree);
        }
        command
    }

    fn check_hooks_folder_is_empty(&self) -> Result<(), GitError> {
        let mut entries = std::fs::read_dir(&self.empty_hooks_folder)
            .map_err(|_| GitError::HooksFolderUnreadable)?;
        match entries.next() {
            None => Ok(()),
            Some(_) => Err(GitError::HooksFolderNotEmpty),
        }
    }
}

/// Gives git config in the environment: `GIT_CONFIG_COUNT`, then a
/// `GIT_CONFIG_KEY_<n>` and `GIT_CONFIG_VALUE_<n>` for each entry.
fn set_config(command: &mut Command, config: &[(OsString, OsString)]) {
    command.env("GIT_CONFIG_COUNT", config.len().to_string());
    for (index, (key, value)) in config.iter().enumerate() {
        command.env(format!("GIT_CONFIG_KEY_{index}"), key);
        command.env(format!("GIT_CONFIG_VALUE_{index}"), value);
    }
}

/// Removes every inherited `GIT_*` variable, such as `GIT_DIR`,
/// `GIT_SSH_COMMAND` or `GIT_CONFIG_PARAMETERS`, which would otherwise
/// change what git does.
fn remove_git_variables(command: &mut Command, inherited: impl Iterator<Item = OsString>) {
    for name in inherited {
        if is_git_variable(&name) {
            command.env_remove(name);
        }
    }
}

/// Whether an environment variable belongs to git. Windows variable names
/// ignore case, so the check does too.
fn is_git_variable(name: &std::ffi::OsStr) -> bool {
    name.to_str()
        .and_then(|name| name.get(..4))
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("GIT_"))
}

#[cfg(test)]
#[path = "runner_tests.rs"]
mod tests;
