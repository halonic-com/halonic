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
        "config user.name Sam",
        "config user.email sam@acme.example",
        "config --get user.name",
        "config --get user.email",
        "pull --ff-only origin main",
        "push --set-upstream origin HEAD:main",
        "push origin +feature:feature",
        "fetch --quiet --no-tags origin",
        "fetch origin main",
        "merge-base HEAD origin/main",
        "merge-base --is-ancestor HEAD origin/main",
        "show origin/main:notes/plan.md",
        "show --no-patch --format=%H origin/main",
        "merge --no-ff --no-commit -s ours origin/main",
        "merge --no-ff --no-commit --strategy=ours --no-edit origin/main",
        "merge --abort",
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

/// The calls that brought a program back or wrote outside the workspace
/// through the git adapter's `Repository.run` (HAL-3971, finding 3).
#[test]
fn git_allow_list_refuses_later_options_that_run_programs_or_write_outside() {
    let calls = [
        "diff --cached --ext-diff",
        "log -p --ext-diff",
        "log -p --textconv -- notes.md",
        "commit --trailer planted=1 -m note",
        "add -p",
        "commit -p -m note",
        "log --output=../owned.txt",
        "diff --output ../owned.txt",
    ];
    for call in calls {
        assert!(refused_option(call), "{call}");
    }
    assert!(matches!(
        check("cat-file --textconv HEAD:a.yaml"),
        Err(GitError::SubcommandNotAllowed { .. })
    ));
    assert!(refused_option("config --file=../owned user.name Sam"));
}

#[test]
fn git_allow_list_refuses_global_options_and_other_subcommands() {
    let calls = [
        "-c core.pager=touch%20owned status",
        "--git-dir=/elsewhere status",
        "--work-tree=/elsewhere status",
        "-C /elsewhere status",
        "--exec-path=/elsewhere status",
        "submodule update",
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
fn git_allow_list_makes_commit_say_where_its_message_comes_from() {
    for call in [
        "commit -m first-note",
        "commit --message=first-note",
        "commit --allow-empty-message -m ",
        "commit --amend --no-edit",
        "commit --amend -m second-note",
    ] {
        assert_eq!(check(call), Ok(()), "{call}");
    }
    // Without a message git takes `commit.template`, which the repository's
    // config can point at any file.
    for call in [
        "commit",
        "commit --allow-empty-message",
        "commit --allow-empty --allow-empty-message -q",
        "commit --amend",
        "commit --no-edit",
        "commit -- -m",
    ] {
        assert_eq!(check(call), Err(GitError::MessageRequired), "{call}");
    }
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
fn git_allow_list_refuses_remote_names_git_reads_as_paths() {
    let refused = [
        "push . main",
        "pull .. main",
        "push .git main",
        "remote add .hidden https://git.acme.example/acme/notes.git",
        "remote rename origin ..",
    ];
    for call in refused {
        let result = check(call);
        assert!(
            matches!(result, Err(GitError::ArgumentNotAllowed { .. })),
            "{call}: {result:?}"
        );
    }
    assert_eq!(check("push acme.mirror main"), Ok(()));
}

#[test]
fn git_allow_list_refuses_urls_whose_host_or_user_reads_as_an_option() {
    let refused = [
        "remote add origin ssh://-oProxyCommand=touch%20owned/acme.git",
        "remote add origin ssh://git@-oProxyCommand=x/acme.git",
        "remote add origin ssh://%2DoProxyCommand=x/acme.git",
        "remote add origin ssh://git@%2Dx/acme.git",
        "remote add origin ssh://-git@git.acme.example/acme.git",
        "remote add origin https://-x/acme.git",
        "remote add origin https:///acme.git",
        "remote set-url origin -oProxyCommand=x@git.acme.example:acme.git",
        "remote set-url origin git@-oProxyCommand=x:acme.git",
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
    assert_eq!(
        check("remote add origin ssh://git@git.acme.example:22/acme/notes.git"),
        Ok(())
    );
}

#[test]
fn git_allow_list_keeps_revisions_and_paths_inside_the_repository() {
    let refused = [
        "diff /dev/null notes/plan.md",
        "diff -- /dev/null notes/plan.md",
        "diff HEAD -- ../../.ssh/id_ed25519",
        "diff -- notes/../../outside.txt",
        "diff -- notes\\..\\..\\outside.txt",
        "log -- \\etc\\passwd",
        "add -- \\\\server\\share\\notes.md",
        "add C:/acme/notes.md",
        "checkout -- c:notes.md",
        "rm --cached -- /srv/acme/notes.md",
    ];
    for call in refused {
        let result = check(call);
        assert!(
            matches!(result, Err(GitError::ArgumentNotAllowed { .. })),
            "{call}: {result:?}"
        );
    }
    let allowed = [
        "diff main..feature -- notes/plan.md",
        "diff HEAD~1 HEAD -- notes/..plan.md",
        "log HEAD:notes/plan.md",
        "add -- ./notes/plan.md",
    ];
    for call in allowed {
        assert_eq!(check(call), Ok(()), "{call}");
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
    let fetch = check_args(&args("fetch origin")).expect("fetch is allowed");
    assert!(fetch.uses_network());
    assert!(
        !check_args(&args("merge --abort"))
            .expect("merge is allowed")
            .uses_network()
    );
    assert!(
        check_args(&args("show HEAD"))
            .expect("show is allowed")
            .shows_diffs()
    );
    assert!(!push.shows_diffs());
    let log = check_args(&args("log --oneline")).expect("log is allowed");
    assert!(!log.uses_network());
    assert!(log.shows_diffs());
    assert_eq!(log.subcommand(), "log");
    assert_eq!(log.args(), ["log", "--oneline"]);
}

#[test]
fn git_allow_list_lets_merge_only_join_history_and_keep_this_side() {
    for call in [
        "merge origin/main",
        "merge --no-ff --no-commit origin/main",
        "merge --no-commit -s ours origin/main",
        "merge --no-ff -s ours origin/main",
        "merge --no-ff --no-commit -s ours",
        "merge --no-ff --no-commit -s ours origin/main other",
        "merge --abort origin/main",
        "merge --abort -q",
        "merge",
    ] {
        assert_eq!(check(call), Err(GitError::MergeNotOurs), "{call}");
    }
    // Any other strategy, or an option to one, could write conflict markers
    // or run a merge driver.
    for call in [
        "merge --no-ff --no-commit -s recursive origin/main",
        "merge --no-ff --no-commit -s resolve origin/main",
        "merge --no-ff --no-commit --strategy=octopus origin/main",
        "merge --no-ff --no-commit -s ours --strategy-option=theirs origin/main",
        "merge --no-ff --no-commit -s ours -X theirs origin/main",
        "merge --no-ff --no-commit -s ours --squash origin/main",
        "merge --no-ff --no-commit -s ours --allow-unrelated-histories origin/main",
        "merge --no-ff --no-commit -s ours --signoff origin/main",
        "merge --no-ff --no-commit -s ours -F /etc/passwd origin/main",
    ] {
        assert!(
            matches!(
                check(call),
                Err(GitError::ValueNotAllowed { .. } | GitError::OptionNotAllowed { .. })
            ),
            "{call}"
        );
    }
}

#[test]
fn git_allow_list_keeps_fetch_to_a_remote_name_and_refs() {
    for call in [
        "fetch https://git.acme.example/acme/notes.git",
        "fetch ext::sh",
        "fetch -- origin",
        "fetch . main",
        "fetch origin ext::sh",
    ] {
        assert!(
            matches!(check(call), Err(GitError::ArgumentNotAllowed { .. })),
            "{call}"
        );
    }
    for call in [
        "fetch --upload-pack=touch%20owned origin",
        "fetch --recurse-submodules origin",
        "fetch --all",
        "fetch --depth=1 origin",
        "merge-base --fork-point HEAD",
        "show --ext-diff HEAD",
        "show --output=owned.txt HEAD",
    ] {
        assert!(refused_option(call), "{call}");
    }
    for call in [
        "show /etc/passwd",
        "show -- ../outside",
        "merge-base HEAD ../x",
    ] {
        assert!(
            matches!(check(call), Err(GitError::ArgumentNotAllowed { .. })),
            "{call}"
        );
    }
}

#[test]
fn git_allow_list_lets_config_touch_only_the_identity() {
    let refused = [
        "config core.hooksPath hooks",
        "config core.sshCommand touch%20owned",
        "config url.x.insteadOf y",
        "config alias.status !touch%20owned",
        "config User.Name Sam",
        "config user.signingkey abc",
        "config user.name",
        "config user.name Sam extra",
        "config --get core.hooksPath",
        "config --get user.name Sam",
        "config --get",
        "config --list",
        "config",
        "config user.name -x",
        "config user.name ",
        "config user.name --",
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
fn git_allow_list_refuses_identity_values_git_would_misread() {
    for value in ["-x", "", "   ", "Sam\nPlanted"] {
        let call = vec![
            "config".to_owned(),
            "user.name".to_owned(),
            value.to_owned(),
        ];
        assert!(check_args(&call).is_err(), "{value:?}");
    }
    let long = vec!["config".to_owned(), "user.name".to_owned(), "a".repeat(255)];
    assert!(check_args(&long).is_err());
    let spaced = vec![
        "config".to_owned(),
        "user.name".to_owned(),
        "Sam Smith".to_owned(),
    ];
    assert!(check_args(&spaced).is_ok());
}
