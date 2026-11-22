//! The repositories nested in the one a call runs in: their folders are
//! checked against the opened folders, and the filters a gitlinked one
//! defines are blanked too (requirement `repo-config`).

use std::path::PathBuf;
use std::time::Instant;

use crate::check_args::CheckedCall;
use crate::error::GitError;
use crate::opened_folders::OpenedFolders;
use crate::repo_config::{add_filters, check_listing};
use crate::repository::{LOCATE_ARGS, Repository, check_located, gitlinks, untracked_repositories};
use crate::runner::GitRunner;

impl GitRunner {
    /// Checks every repository nested in `repository` as a gitlink, such as
    /// a submodule, and adds the filters its config defines.
    ///
    /// git looks into them on its own: `add`, `status` and `diff` run
    /// `git status` inside each, which reads that repository's config. The
    /// config the runner gives in the environment goes along, so blanking
    /// their filters too keeps them from running there.
    pub(crate) fn add_nested_filters(
        &self,
        folders: &OpenedFolders,
        repository: &Repository,
        visited: &mut Vec<PathBuf>,
        filters: &mut Vec<String>,
        deadline: Instant,
    ) -> Result<(), GitError> {
        let index = self.run_internal(
            &repository.top,
            Some(repository),
            &["ls-files", "--stage", "-z"],
            deadline,
        )?;
        check_listing(index.code)?;
        for path in gitlinks(&index.stdout)? {
            let folder = repository.top.join(path);
            // A submodule that isn't checked out has no `.git`, and git
            // doesn't look into it.
            if std::fs::symlink_metadata(folder.join(".git")).is_err() {
                continue;
            }
            // A `.git` git can't follow here could still be one it follows
            // later, so it is refused rather than skipped.
            let located = self.run_internal(&folder, None, LOCATE_ARGS, deadline)?;
            check_listing(located.code)?;
            let nested = check_located(folders, &located.stdout, deadline)?;
            if visited.contains(&nested.top) {
                continue;
            }
            visited.push(nested.top.clone());
            let entries = self.read_config(&nested.top, Some(&nested), deadline)?;
            add_filters(&entries, filters);
            self.add_nested_filters(folders, &nested, visited, filters, deadline)?;
        }
        Ok(())
    }

    /// Checks every repository nested in `repository` that isn't a gitlink
    /// yet, as [`Self::add_nested_filters`] does for the tracked ones: `add`
    /// would record it as one, and reads its `HEAD` and refs to do so.
    /// git looks at no other part of it. Ignored ones are listed only for a
    /// forced `add`, the one call that records them.
    pub(crate) fn check_untracked_nested(
        &self,
        folders: &OpenedFolders,
        repository: &Repository,
        call: &CheckedCall,
        deadline: Instant,
    ) -> Result<(), GitError> {
        let mut args = vec!["ls-files", "--others", "-z"];
        if !adds_ignored_files(call) {
            args.push("--exclude-standard");
        }
        let listing = self.run_internal(&repository.top, Some(repository), &args, deadline)?;
        check_listing(listing.code)?;
        for path in untracked_repositories(&listing.stdout)? {
            let folder = repository.top.join(path);
            let located = self.run_internal(&folder, None, LOCATE_ARGS, deadline)?;
            check_listing(located.code)?;
            check_located(folders, &located.stdout, deadline)?;
        }
        Ok(())
    }
}

/// Whether the call is `add` with `--force`, which adds ignored files too.
/// A path named `-f` after `--` counts as well; that only lists more.
fn adds_ignored_files(call: &CheckedCall) -> bool {
    call.subcommand() == "add"
        && call
            .args()
            .iter()
            .any(|arg| arg == "-f" || arg == "--force")
}
