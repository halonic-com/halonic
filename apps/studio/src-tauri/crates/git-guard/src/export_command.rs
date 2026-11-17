//! The git command for one step of an export (requirement `git-export`).

use std::ffi::OsString;
use std::path::Path;
use std::process::Command;

use crate::opened_folders::plain_path;
use crate::runner::GitRunner;

/// The folders of an export that one git step works in. Each is the
/// export's own and absent when the step needs none.
#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct ExportPlace<'a> {
    pub git_dir: Option<&'a Path>,
    pub work_tree: Option<&'a Path>,
    pub index: Option<&'a Path>,
}

impl GitRunner {
    /// The command for one step of an export (`export.rs`): the base
    /// command with the hardening, in `cwd`, which is a folder of the
    /// export's own, never a repository. Unlike the allow-listed calls, an
    /// export reads nothing from outside: no user config (so no credential
    /// helper and no filter driver, whatever the user has set), no
    /// excludes or attributes file, and ssh that never asks a question.
    /// `git_dir`, `work_tree` and `index` are the export's own folders.
    /// `ssh` is the program git starts for `ssh://`, the `ssh` on the PATH
    /// when `None`.
    pub(crate) fn export_command(
        &self,
        cwd: &Path,
        place: &ExportPlace<'_>,
        ssh: Option<&Path>,
    ) -> Command {
        let overrides: Vec<(String, String)> = [
            ("credential.helper", ""),
            ("core.excludesFile", ""),
            ("core.attributesFile", ""),
        ]
        .iter()
        .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
        .collect();
        let mut command = self.base_command(cwd, None, &overrides);
        command
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CEILING_DIRECTORIES", cwd)
            .env("LC_ALL", "C");
        match ssh {
            Some(program) => command
                .env("GIT_SSH_COMMAND", program)
                .env("GIT_SSH_VARIANT", "simple"),
            None => command.env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes"),
        };
        if let Some(git_dir) = place.git_dir {
            let mut argument = OsString::from("--git-dir=");
            argument.push(plain_path(git_dir));
            command.arg(argument);
        }
        if let Some(work_tree) = place.work_tree {
            let mut argument = OsString::from("--work-tree=");
            argument.push(plain_path(work_tree));
            command.arg(argument);
        }
        if let Some(index) = place.index {
            command.env("GIT_INDEX_FILE", index);
        }
        command
    }
}
