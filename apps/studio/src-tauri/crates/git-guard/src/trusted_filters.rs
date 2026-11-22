//! Which filter drivers the runner blanks, by where they are defined and
//! whether the person trusted the folder (requirement `trusted-filters`).
//!
//! A filter a repository's own config defines never runs: anyone who can
//! write the folder wrote it. A filter only the user's own config defines,
//! such as git-lfs, is the user's program, but it reads the repository's
//! config too, so it runs only where the person trusted the folder: every
//! folder of the repository, and of every repository nested in it as a
//! gitlink, is inside a folder they trusted. The repository's git-lfs keys
//! that name a program are refused either way (requirement `repo-config`).

use std::path::Path;

use crate::repo_config::{ConfigEntry, add_filters};
use crate::repository::Repository;

/// The filter drivers the configs of the repositories a call reaches
/// define: every one, and those a repository's own config defines.
#[derive(Debug, Default)]
pub(crate) struct Filters {
    all: Vec<String>,
    repository: Vec<String>,
}

impl Filters {
    /// Adds the filters one repository's config listing defines.
    pub(crate) fn add(&mut self, entries: &[ConfigEntry]) {
        add_filters(entries, &mut self.all);
        let own: Vec<ConfigEntry> = entries
            .iter()
            .filter(|entry| entry.is_from_repository())
            .cloned()
            .collect();
        add_filters(&own, &mut self.repository);
    }

    /// The filters to blank: those a repository's own config defines, and
    /// unless `trusted`, the user's own too. A filter both define counts as
    /// the repository's, so its own keys can't change the user's filter.
    pub(crate) fn blanked(self, trusted: bool) -> Vec<String> {
        if trusted { self.repository } else { self.all }
    }
}

/// Whether every folder of `repositories` is inside a folder the person
/// trusted, as `trusted` answers for a canonical folder.
pub(crate) fn in_trusted_folders(
    repositories: &[Repository],
    trusted: &dyn Fn(&Path) -> bool,
) -> bool {
    repositories.iter().all(|repository| {
        [&repository.top, &repository.git_dir, &repository.common_dir]
            .into_iter()
            .all(|folder| trusted(folder))
    })
}

#[cfg(test)]
#[path = "trusted_filters_tests.rs"]
mod tests;
