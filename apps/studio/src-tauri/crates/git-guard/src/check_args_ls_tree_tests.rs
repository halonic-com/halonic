use super::check_args;
use crate::error::GitError;

fn args(text: &str) -> Vec<String> {
    text.split(' ').map(str::to_owned).collect()
}

fn check(text: &str) -> Result<(), GitError> {
    check_args(&args(text)).map(|_| ())
}

fn refused_option(text: &str) -> bool {
    matches!(check(text), Err(GitError::OptionNotAllowed { .. }))
}

#[test]
fn git_allow_list_allows_the_ls_tree_calls_the_live_version_reader_makes() {
    // What the page's reader of the live version runs (HAL-14229).
    let calls = [
        "ls-tree -r -z 0123abc",
        "ls-tree -r -z --full-tree 0123abc",
        "ls-tree -r -z 0123abc -- agents",
    ];
    for call in calls {
        assert_eq!(check(call), Ok(()), "{call}");
    }
    let call = check_args(&args("ls-tree -r -z 0123abc")).expect("ls-tree is allowed");
    assert!(!call.uses_network());
    assert!(!call.shows_diffs());
}

#[test]
fn git_allow_list_refuses_ls_tree_options_off_its_list() {
    let calls = [
        "ls-tree --format=%(objectname) 0123abc",
        "ls-tree --name-only 0123abc",
        "ls-tree --name-status 0123abc",
        "ls-tree -l 0123abc",
        "ls-tree --long 0123abc",
        "ls-tree --abbrev=4 0123abc",
        "ls-tree --abbrev 0123abc",
        "ls-tree -d 0123abc",
        "ls-tree -t 0123abc",
        "ls-tree --object-only 0123abc",
        "ls-tree -rz 0123abc",
        "ls-tree --full-name 0123abc",
    ];
    for call in calls {
        assert!(refused_option(call), "{call}");
    }
}

#[test]
fn git_allow_list_keeps_ls_tree_paths_inside_the_repository() {
    assert!(check("ls-tree -r -z 0123abc -- ../outside").is_err());
    assert!(check("ls-tree -r -z 0123abc -- /etc").is_err());
}
