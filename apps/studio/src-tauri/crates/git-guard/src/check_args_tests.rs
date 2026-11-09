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
fn git_allow_list_allows_the_calls_the_adapter_makes() {
    let calls = [
        "status --porcelain=v2 --branch -z --untracked-files=all",
        "diff --cached --name-status -z",
        "diff --unified=3 HEAD -- notes/plan.md",
        "log --max-count=50 --format=%H%x00%s --date=iso",
        "log -n 20 --oneline --follow -- notes/plan.md",
        "add -A",
        "add -- notes/plan.md",
        "reset --hard HEAD",
        "rm --cached -r -- build",
        "checkout -b feature/acme-notes",
        "checkout -- notes/plan.md",
        "switch -c acme-draft",
        "clean -f -d",
        "commit -m first-note",
        "commit --amend --no-edit",
        "branch --format=%(refname:short) --list",
        "init -b main",
        "rev-parse --abbrev-ref HEAD",
        "ls-files --others --exclude-standard -z",
        "remote -v",
        "remote add origin https://git.acme.example/acme/notes.git",
        "remote set-url origin git@git.acme.example:acme/notes.git",
        "remote remove origin",
        "pull --ff-only origin main",
        "push --set-upstream origin HEAD:main",
        "push origin +feature:feature",
    ];
    for call in calls {
        assert_eq!(check(call), Ok(()), "{call}");
    }
}

#[test]
fn git_allow_list_refuses_the_options_the_old_shell_blocked() {
    let calls = [
        "pull --upload-pack=touch%20owned",
        "push --receive-pack=touch%20owned",
        "pull --exec=touch%20owned",
        "push --exec=touch%20owned",
        "diff --output=owned.txt",
        "log --ext-diff",
        "diff --textconv",
        "commit -F /etc/passwd",
        "diff --no-index a b",
        "init --template=hooks",
    ];
    for call in calls {
        assert!(refused_option(call), "{call}");
    }
}

#[test]
fn git_allow_list_refuses_shortened_and_bundled_options() {
    let calls = [
        "pull --upload-pac=touch%20owned",
        "pull --upl=touch%20owned",
        "pull --upl",
        "pull -u touch%20owned",
        "push --receive-pac=x",
        "push --rec=x",
        "log --out=owned.txt",
        "diff --ext",
        "commit -mtext",
        "clean -fd",
        "status --porcelain=v2=x",
    ];
    for call in calls {
        let result = check(call);
        assert!(
            matches!(
                result,
                Err(GitError::OptionNotAllowed { .. } | GitError::ValueNotAllowed { .. })
            ),
            "{call}: {result:?}"
        );
    }
}

#[test]
fn git_allow_list_refuses_global_options_and_other_subcommands() {
    let calls = [
        "-c core.pager=touch%20owned status",
        "--git-dir=/elsewhere status",
        "--work-tree=/elsewhere status",
        "-C /elsewhere status",
        "--exec-path=/elsewhere status",
        "config core.hooksPath hooks",
        "submodule update",
        "fetch origin",
        "clone https://git.acme.example/acme/notes.git",
    ];
    for call in calls {
        assert!(
            matches!(check(call), Err(GitError::SubcommandNotAllowed { .. })),
            "{call}"
        );
    }
    assert_eq!(check_args(&[]).map(|_| ()), Err(GitError::NoSubcommand));
}

#[test]
fn git_allow_list_checks_option_values() {
    let calls = [
        "log --max-count=all",
        "log -n -1",
        "status --untracked-files=everything",
        "checkout -b --orphan",
        "switch -c ../../escape",
        "log --date=format:%s",
    ];
    for call in calls {
        let result = check(call);
        assert!(
            matches!(result, Err(GitError::ValueNotAllowed { .. })),
            "{call}: {result:?}"
        );
    }
    assert!(matches!(
        check("commit -m"),
        Err(GitError::MissingValue { .. })
    ));
}

#[test]
fn git_allow_list_takes_urls_only_through_remote() {
    let refused = [
        "push https://git.acme.example/acme/notes.git main",
        "pull ext::sh",
        "pull origin ext::sh",
        "push origin main://x",
        "push -- origin",
        "init elsewhere",
        "remote add origin ext::sh%20-c%20touch",
        "remote add origin file:///srv/acme.git",
        "remote add origin /srv/acme.git",
        "remote add origin ../acme.git",
        "remote add origin http://git.acme.example/acme.git",
        "remote add origin git@git.acme.example://acme.git",
        "remote add -f origin https://git.acme.example/acme.git",
        "remote prune origin",
    ];
    for call in refused {
        let result = check(call);
        assert!(
            matches!(
                result,
                Err(GitError::ArgumentNotAllowed { .. } | GitError::OptionNotAllowed { .. })
            ),
            "{call}: {result:?}"
        );
    }
}

#[test]
fn git_allow_list_reads_everything_after_the_separator_as_paths() {
    assert_eq!(check("add -- --upload-pack=x -c"), Ok(()));
    assert_eq!(check("checkout -- -b"), Ok(()));
}

#[test]
fn git_allow_list_marks_network_and_diff_calls() {
    let push = check_args(&args("push origin main")).expect("push is allowed");
    assert!(push.uses_network());
    assert!(!push.shows_diffs());
    let log = check_args(&args("log --oneline")).expect("log is allowed");
    assert!(!log.uses_network());
    assert!(log.shows_diffs());
    assert_eq!(log.subcommand(), "log");
    assert_eq!(log.args(), ["log", "--oneline"]);
}
