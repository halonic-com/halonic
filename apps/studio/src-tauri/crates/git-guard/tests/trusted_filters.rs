//! The user's own filter runs in a folder the person trusted, and nowhere
//! else; a filter the repository's config defines never runs (requirement
//! `trusted-filters`).
//!
//! The user's own config is the global one, which git finds through `HOME`
//! and `XDG_CONFIG_HOME`. A test can't change its own process's environment
//! safely, so the test runs itself again as a child process with both set
//! to a made-up home, and the child runs the checks.

#![cfg(unix)]
#![allow(
    clippy::disallowed_methods,
    reason = "a test's programs share its console"
)]

mod support;

use std::path::Path;
use std::process::Command;

use halonic_git_guard::{GitError, GitOutput};
use support::{Sandbox, TemporaryFolder, config_value};

const TEST_NAME: &str = "trusted_filters_run_the_users_own_filter_only_in_a_trusted_folder";

/// Set in the child process, to the made-up home.
const CHILD_HOME: &str = "HALONIC_GIT_GUARD_TEST_HOME";

#[test]
fn trusted_filters_run_the_users_own_filter_only_in_a_trusted_folder() {
    if let Some(home) = std::env::var_os(CHILD_HOME) {
        return check_in_child(Path::new(&home));
    }
    let home = TemporaryFolder::new();
    let mark = home.path().join("acme-filter.ran");
    // The user's own filter writes `acme` in capitals and leaves a mark.
    let clean = format!("sed s/acme/ACME/ && touch {}", shell_quote(&mark));
    let config = format!("[filter \"acme\"]\n\tclean = {}\n", config_value(&clean));
    std::fs::write(home.path().join(".gitconfig"), config).expect("the config writes");
    let child = Command::new(std::env::current_exe().expect("the test knows its program"))
        .args(["--exact", TEST_NAME, "--nocapture", "--test-threads=1"])
        .env(CHILD_HOME, home.path())
        .env("HOME", home.path())
        .env("XDG_CONFIG_HOME", home.path().join("xdg"))
        .output()
        .expect("the test runs itself again");
    assert!(
        child.status.success(),
        "{}{}",
        String::from_utf8_lossy(&child.stdout),
        String::from_utf8_lossy(&child.stderr)
    );
}

/// The checks, in a process whose home holds the user's `acme` filter.
fn check_in_child(home: &Path) {
    let mark = home.join("acme-filter.ran");
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.write(".gitattributes", "*.md filter=acme\n");
    sandbox.write("notes.md", "acme notes\n");
    let acme = std::fs::canonicalize(&sandbox.acme).expect("acme is a folder");
    let trusted = |folder: &Path| folder.starts_with(&acme);

    // Not trusted: the user's filter is blanked, so `add` is refused, and
    // the refusal says trusting the workspace would run it.
    let refused = sandbox.git("add -A").expect_err("add is refused");
    assert_eq!(refused.kind(), "filter_needs_trust");
    assert_eq!(
        refused.to_string(),
        "git add would store or write files without their acme filter, which the Studio runs only in a workspace you trust; press Review in the header to trust it, then try again"
    );
    assert_eq!(
        refused,
        GitError::FilterNotRun {
            subcommand: "add".to_owned(),
            filter: "acme".to_owned(),
            trust_runs: true,
        }
    );
    assert!(!mark.exists(), "the filter ran outside a trusted folder");

    // Trusted: it runs, and what is stored is what it wrote.
    let added = trusted_git(&sandbox, &trusted, "add -A").expect("add runs");
    assert_eq!(
        added.code,
        Some(0),
        "{}",
        String::from_utf8_lossy(&added.stderr)
    );
    assert!(
        mark.exists(),
        "the user's filter didn't run in a trusted folder"
    );
    assert_eq!(sandbox.git_ok("show :notes.md"), "ACME notes\n");
    std::fs::remove_file(&mark).expect("the mark is removed");

    // The repository's own config defines a filter: blanked even here.
    sandbox.append_config("[filter \"crypt\"]\n\tclean = acme-crypt\n");
    sandbox.write(".gitattributes", "*.md filter=acme\n*.txt filter=crypt\n");
    sandbox.write("todo.txt", "acme todo\n");
    assert_eq!(
        trusted_git(&sandbox, &trusted, "add -A").map(|_| ()),
        Err(GitError::FilterNotRun {
            subcommand: "add".to_owned(),
            filter: "crypt".to_owned(),
            trust_runs: false,
        })
    );
    // Not trusted either: trust wouldn't run the repository's filter, so
    // the refusal names it, though the user's comes first, and keeps the
    // terminal advice.
    let refused = sandbox.git("add -A").expect_err("add is refused");
    assert_eq!(
        refused,
        GitError::FilterNotRun {
            subcommand: "add".to_owned(),
            filter: "crypt".to_owned(),
            trust_runs: false,
        }
    );
    assert_eq!(
        refused.to_string(),
        "git add would store or write files without their crypt filter, which the repository's own config defines and the Studio never runs; make this change with git in a terminal"
    );

    // The repository's config redefines the user's filter: the user's is
    // blanked too, so neither program runs.
    std::fs::remove_file(sandbox.acme.join("todo.txt")).expect("the file is removed");
    sandbox.write(".gitattributes", "*.md filter=acme\n");
    sandbox.write("notes.md", "acme notes, changed\n");
    sandbox.append_config("[filter \"acme\"]\n\tsmudge = acme-smudge\n");
    assert_eq!(
        trusted_git(&sandbox, &trusted, "add -A").map(|_| ()),
        Err(GitError::FilterNotRun {
            subcommand: "add".to_owned(),
            filter: "acme".to_owned(),
            trust_runs: false,
        })
    );
    sandbox.git_ok("status --porcelain");
    trusted_git(&sandbox, &trusted, "status --porcelain").expect("status runs");
    assert!(
        !mark.exists(),
        "the user's filter ran with the repository's keys"
    );
}

fn trusted_git(
    sandbox: &Sandbox,
    trusted: &dyn Fn(&Path) -> bool,
    call: &str,
) -> Result<GitOutput, GitError> {
    let args: Vec<String> = call.split(' ').map(str::to_owned).collect();
    sandbox
        .runner
        .run_trusted(&sandbox.folders, trusted, &sandbox.acme, &args)
}

/// A path in single quotes for the shell git runs a filter through.
fn shell_quote(path: &Path) -> String {
    format!("'{}'", path.display().to_string().replace('\'', "'\\''"))
}
