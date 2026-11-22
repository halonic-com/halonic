use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

use crate::check_args::{CheckedCall, check_args};
use crate::error::GitError;
use crate::hardening::{HARDENING_CONFIG, HARDENING_ENVIRONMENT};
use crate::limited_run::{GitOutput, Limits, new_command, run_limited};
use crate::opened_folders::{OpenedFolders, canonical, plain_path};
use crate::repo_config::{
    ConfigEntry, add_filters, blank_filters, blank_merge_options, check_listing,
    check_refused_keys, has_command_entry, neutralise_programs, parse_listing,
};
use crate::repository::{LOCATE_ARGS, Repository, check_located};

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

/// What the checks found out about the folder a call runs in.
struct Checked {
    /// The repository, or `None` for an `init` outside one.
    repository: Option<Repository>,
    /// Config that neutralises what the repository's config names.
    overrides: Vec<(String, String)>,
}

impl GitRunner {
    /// A runner for the git program at `git`, an absolute path (see
    /// [`crate::find_git`]). `empty_hooks_folder` is created if it is
    /// missing and must stay empty: every call points `core.hooksPath` at
    /// it, so no repository hook ever runs.
    ///
    /// Refuses a program that doesn't take the runner's config, such as a
    /// wrapper script that drops the `GIT_CONFIG_*` variables before it
    /// starts git: every call would then run with no hardening.
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
        runner.check_hardening_reaches_git()?;
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
    /// and the repository's own config, which is then neutralised. Only
    /// then does the call run, hardened. One time limit covers all of it.
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
        let checked = match self.check_folder(folders, &root, &call, deadline)? {
            Ok(checked) => checked,
            Err(answer) => return Ok(answer),
        };
        // `init` makes the folder a repository of its own, so git must find
        // it there, not in the folders given by an outer repository.
        let repository = match call.subcommand() {
            "init" => None,
            _ => checked.repository.as_ref(),
        };
        let mut command = self.hardened_command(&root, repository, &call, &checked.overrides);
        run_limited(&mut command, deadline, self.limits.max_output_bytes)
    }

    /// Checks the folder a call runs in and the repository it belongs to.
    /// Gives git's own answer back when the folder is not in a repository:
    /// `init` goes ahead, and every other call gets that answer, which is
    /// what it would have got anyway.
    fn check_folder(
        &self,
        folders: &OpenedFolders,
        root: &Path,
        call: &CheckedCall,
        deadline: Instant,
    ) -> Result<Result<Checked, GitOutput>, GitError> {
        let located = self.run_internal(root, None, LOCATE_ARGS, deadline)?;
        if located.code != Some(0) {
            if call.subcommand() != "init" {
                return Ok(Err(located));
            }
            // Outside a repository only the user's own config applies, but
            // git must still show it took the runner's.
            self.read_config(root, None, deadline)?;
            return Ok(Ok(Checked {
                repository: None,
                overrides: Vec::new(),
            }));
        }
        let repository = check_located(folders, &located.stdout, deadline)?;
        let entries = self.read_config(root, Some(&repository), deadline)?;
        check_refused_keys(&entries)?;
        let mut filters = Vec::new();
        add_filters(&entries, &mut filters);
        let mut visited = vec![repository.top.clone()];
        self.add_nested_filters(folders, &repository, &mut visited, &mut filters, deadline)?;
        self.check_untracked_nested(folders, &repository, call, deadline)?;
        self.check_filter_writes(&repository, &entries, &filters, call, deadline)?;
        let mut overrides = blank_filters(&filters);
        overrides.extend(neutralise_programs(&entries));
        if call.subcommand() == "merge" {
            overrides.extend(blank_merge_options(&entries));
        }
        Ok(Ok(Checked {
            repository: Some(repository),
            overrides,
        }))
    }

    /// Lists the config git would use, refuses a listing git could not
    /// give, and checks that git took the runner's own config.
    pub(crate) fn read_config(
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
    pub(crate) fn run_internal(
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
        // `remote.<name>.uploadpack` and `receivepack`.
        match subcommand.as_str() {
            "pull" => {
                // `merge.autoStash`, `pull.rebase` and `branch.<name>.rebase`:
                // before git 2.34 `--ff-only` did not beat a rebase setting,
                // and an autostash re-applies with a real merge.
                command.args([
                    "--upload-pack=git-upload-pack",
                    "--no-rebase",
                    "--no-autostash",
                ]);
            }
            "fetch" => {
                command.arg("--upload-pack=git-upload-pack");
            }
            "push" => {
                command.arg("--receive-pack=git-receive-pack");
            }
            _ => {}
        }
        if !call.shows_diffs() {
            command.args(rest);
            return command;
        }
        // `diff.external`, `diff.<driver>.command` and `textconv`. The last
        // of two opposite options wins, so these go after the call's own,
        // just before the paths.
        let paths_start = rest
            .iter()
            .position(|arg| arg == "--")
            .unwrap_or(rest.len());
        let (options, paths) = rest.split_at(paths_start);
        command.args(options);
        command.args(["--no-ext-diff", "--no-textconv"]);
        command.args(paths);
        command
    }

    /// git with no shell, a clean `GIT_*` environment, the hardening config
    /// and `overrides`, and, in a checked repository, its checked folders,
    /// so a link swapped in after the checks can't move the call.
    pub(crate) fn base_command(
        &self,
        root: &Path,
        repository: Option<&Repository>,
        overrides: &[(String, String)],
    ) -> Command {
        let mut command = new_command(&self.git);
        command.current_dir(root).stdin(Stdio::null());
        remove_git_variables(&mut command, std::env::vars_os().map(|(name, _)| name));
        command.envs(HARDENING_ENVIRONMENT.iter().copied());
        let mut config: Vec<(OsString, OsString)> =
            vec![(HOOKS_PATH.into(), plain_path(&self.empty_hooks_folder))];
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
            git_dir.push(plain_path(&repository.git_dir));
            let mut work_tree = OsString::from("--work-tree=");
            work_tree.push(plain_path(&repository.top));
            command.arg(git_dir).arg(work_tree);
        }
        command
    }

    /// The limits this runner works within.
    pub(crate) fn limits(&self) -> Limits {
        self.limits
    }

    /// Checks that the empty hooks folder is still empty, before an export.
    pub(crate) fn check_hooks_for_export(&self) -> Result<(), GitError> {
        self.check_hooks_folder_is_empty()
    }

    /// Checks once that the hardening config reaches git (HAL-4399). git
    /// answers with the empty hooks folder only if the config arrived. The
    /// call runs in the hooks folder, which is no repository, so no
    /// repository's config is read.
    fn check_hardening_reaches_git(&self) -> Result<(), GitError> {
        let deadline = Instant::now() + self.limits.local_timeout;
        let answer = self.run_internal(
            &self.empty_hooks_folder,
            None,
            &["config", "--get", HOOKS_PATH],
            deadline,
        )?;
        let answered = String::from_utf8_lossy(&answer.stdout);
        let answered = answered.trim_end_matches(['\n', '\r']);
        let expected = plain_path(&self.empty_hooks_folder);
        if answer.code != Some(0) || expected.to_string_lossy() != answered {
            return Err(GitError::HardeningIgnored {
                git: self.git.to_string_lossy().into_owned(),
            });
        }
        Ok(())
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

#[cfg(all(test, unix))]
#[path = "runner_fetch_tests.rs"]
mod fetch_tests;
