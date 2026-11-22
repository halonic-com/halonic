use std::path::{Path, PathBuf};

use super::{Filters, in_trusted_folders};
use crate::repo_config::ConfigEntry;
use crate::repository::Repository;

fn entry(scope: &str, key: &str) -> ConfigEntry {
    ConfigEntry {
        scope: scope.to_owned(),
        key: key.to_owned(),
        value: "acme-filter".to_owned(),
    }
}

fn repository(top: &str, git_dir: &str) -> Repository {
    Repository {
        top: PathBuf::from(top),
        git_dir: PathBuf::from(git_dir),
        common_dir: PathBuf::from(git_dir),
    }
}

fn filters() -> Filters {
    let mut filters = Filters::default();
    filters.add(&[
        entry("global", "filter.lfs.clean"),
        entry("global", "filter.lfs.process"),
        entry("global", "filter.mine.smudge"),
        entry("local", "filter.crypt.smudge"),
        entry("command", "filter.cli.clean"),
    ]);
    // A nested repository's own config redefines one of the user's.
    filters.add(&[
        entry("global", "filter.lfs.clean"),
        entry("worktree", "filter.mine.clean"),
    ]);
    filters
}

#[test]
fn trusted_filters_blank_only_the_repositories_own_in_a_trusted_folder() {
    assert_eq!(filters().blanked(true), ["crypt", "mine"]);
}

#[test]
fn trusted_filters_blank_every_filter_outside_a_trusted_folder() {
    assert_eq!(filters().blanked(false), ["lfs", "mine", "crypt", "cli"]);
}

#[test]
fn trusted_filters_need_every_folder_of_every_repository_trusted() {
    let trusted = |folder: &Path| folder.starts_with("/acme/trusted");
    let inside = repository("/acme/trusted/notes", "/acme/trusted/notes/.git");
    let nested = repository(
        "/acme/trusted/notes/sub",
        "/acme/trusted/notes/.git/modules/sub",
    );
    assert!(in_trusted_folders(&[inside.clone(), nested], &trusted));
    let git_dir_outside = repository("/acme/trusted/notes", "/acme/other/notes.git");
    assert!(!in_trusted_folders(&[git_dir_outside], &trusted));
    let mut common_dir_outside = inside.clone();
    common_dir_outside.common_dir = PathBuf::from("/acme/other/notes.git");
    assert!(!in_trusted_folders(&[common_dir_outside], &trusted));
    let nested_outside = repository("/acme/trusted/notes/sub", "/acme/other/sub.git");
    assert!(!in_trusted_folders(&[inside, nested_outside], &trusted));
    // A repository whose top is above the trusted folder isn't trusted.
    let above = repository("/acme", "/acme/.git");
    assert!(!in_trusted_folders(&[above], &trusted));
}
