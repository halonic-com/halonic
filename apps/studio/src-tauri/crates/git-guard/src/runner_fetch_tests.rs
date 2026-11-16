//! What the hardened command does once `pull` reaches another machine.
//!
//! The runner allows only `https` and `ssh`, and no test can reach a real
//! server. So these tests build the runner's own command and add one thing:
//! an ssh that runs `git-upload-pack` here instead of on a server. All the
//! rest, config, environment and flags, is the runner's.

use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use super::GitRunner;
use crate::check_args::check_args;
use crate::find_git::find_git;
use crate::limited_run::Limits;
use crate::repo_config::{ConfigEntry, blank_merge_options};
use crate::repository::Repository;

/// A folder under the system's temporary folder, removed when dropped.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder = std::env::temp_dir().join(format!("git-guard-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the folder is created");
        Self(std::fs::canonicalize(&folder).expect("the folder resolves"))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn git_program() -> PathBuf {
    let path = std::env::var_os("PATH").unwrap_or_default();
    find_git(&path).expect("the tests need git on the PATH")
}

/// Runs git with no hardening, to set a test up.
fn plain_git(folder: &Path, args: &[&str]) -> Output {
    let mut command = Command::new(git_program());
    for (name, _) in std::env::vars_os() {
        if name
            .to_string_lossy()
            .to_ascii_uppercase()
            .starts_with("GIT_")
        {
            command.env_remove(name);
        }
    }
    command
        .current_dir(folder)
        .args([
            "-c",
            "user.name=Acme Tester",
            "-c",
            "user.email=tester@acme.example",
        ])
        .args(["-c", "init.defaultBranch=main"])
        .args(args)
        .output()
        .expect("git runs")
}

fn plain_git_ok(folder: &Path, args: &[&str]) {
    let output = plain_git(folder, args);
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

/// An ssh that runs the command it is given (its last argument) here.
fn local_ssh(scratch: &Path) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;
    let ssh = scratch.join("local-ssh");
    std::fs::write(
        &ssh,
        "#!/bin/sh\nfor last; do :; done\nexec sh -c \"$last\"\n",
    )
    .expect("the ssh writes");
    std::fs::set_permissions(&ssh, std::fs::Permissions::from_mode(0o755))
        .expect("the ssh is executable");
    ssh
}

/// A repository with an alternate inside it, whose config names `remote`
/// as `origin` and plants `core.alternateRefsCommand`. It has no commits, so
/// a pull must fetch.
fn user_repository(root: &Path, name: &str, remote: &str, mark: &Path) -> Repository {
    let top = root.join(name);
    let shared = top.join("shared");
    std::fs::create_dir_all(&shared).expect("the folder is created");
    plain_git_ok(&top, &["init", "-q"]);
    plain_git_ok(&shared, &["init", "-q"]);
    std::fs::write(
        top.join(".git/objects/info/alternates"),
        "../../shared/.git/objects\n",
    )
    .expect("the alternates write");
    plain_git_ok(&top, &["config", "remote.origin.url", remote]);
    let command = format!("touch '{}'", mark.display());
    plain_git_ok(&top, &["config", "core.alternateRefsCommand", &command]);
    let git_dir = top.join(".git");
    Repository {
        top,
        git_dir: git_dir.clone(),
        common_dir: git_dir,
    }
}

#[test]
fn git_hardening_never_runs_an_alternate_refs_command_on_pull() {
    let scratch = Scratch::new("alternate-refs");
    let root = &scratch.0;
    // The server's repository, with one commit on main.
    let server = root.join("server");
    std::fs::create_dir_all(&server).expect("the folder is created");
    plain_git_ok(&server, &["init", "-q"]);
    std::fs::write(server.join("notes.md"), "acme notes\n").expect("the file writes");
    plain_git_ok(&server, &["add", "notes.md"]);
    plain_git_ok(&server, &["commit", "-q", "-m", "first-note"]);
    let remote = format!("ssh://git.acme.invalid{}", server.display());
    let mark = root.join("alternate-refs.ran");
    let ssh = local_ssh(root);
    let runner = GitRunner {
        git: git_program(),
        empty_hooks_folder: root.join("empty-hooks"),
        limits: Limits::default(),
    };
    std::fs::create_dir_all(&runner.empty_hooks_folder).expect("the folder is created");
    let acme = user_repository(root, "acme", &remote, &mark);
    let args = ["pull".to_owned(), "origin".to_owned(), "main".to_owned()];
    let call = check_args(&args).expect("the call is allowed");
    let output = runner
        .hardened_command(&acme.top, Some(&acme), &call, &[])
        .env("GIT_SSH_COMMAND", &ssh)
        .env("GIT_SSH_VARIANT", "simple")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        acme.top.join("notes.md").exists(),
        "the pull fetched nothing"
    );
    assert!(!mark.exists(), "the alternate refs command ran");
    // Without the runner, the same pull in the same kind of repository
    // runs the command.
    let other = user_repository(root, "other", &remote, &mark);
    let output = Command::new(git_program())
        .current_dir(&other.top)
        .env("GIT_SSH_COMMAND", &ssh)
        .env("GIT_SSH_VARIANT", "simple")
        .args(["pull", "origin", "main"])
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(mark.exists(), "plain git ran no alternate refs command");
}

/// Runs an allowed call hardened, against the stand-in ssh.
fn run_checked(runner: &GitRunner, repository: &Repository, ssh: &Path, text: &str) -> Output {
    let args: Vec<String> = text.split(' ').map(str::to_owned).collect();
    let call = check_args(&args).expect("the call is allowed");
    runner
        .hardened_command(&repository.top, Some(repository), &call, &[])
        .env("GIT_SSH_COMMAND", ssh)
        .env("GIT_SSH_VARIANT", "simple")
        // A merge wants an identity even without a commit, and a CI runner has no global one.
        .env("GIT_AUTHOR_NAME", "Acme Tester")
        .env("GIT_AUTHOR_EMAIL", "tester@acme.example")
        .env("GIT_COMMITTER_NAME", "Acme Tester")
        .env("GIT_COMMITTER_EMAIL", "tester@acme.example")
        .output()
        .expect("git runs")
}

fn stdout_of(output: &Output) -> String {
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).into_owned()
}

#[test]
fn git_allow_list_gets_the_other_side_and_merges_without_conflict_markers() {
    let scratch = Scratch::new("merge-ours");
    let root = &scratch.0;
    let server = root.join("server");
    std::fs::create_dir_all(&server).expect("the folder is created");
    plain_git_ok(&server, &["init", "-q"]);
    std::fs::write(server.join("notes.md"), "one\n").expect("the file writes");
    plain_git_ok(&server, &["add", "notes.md"]);
    plain_git_ok(&server, &["commit", "-q", "-m", "first-note"]);
    let remote = format!("ssh://git.acme.invalid{}", server.display());
    let ssh = local_ssh(root);
    let runner = GitRunner {
        git: git_program(),
        empty_hooks_folder: root.join("empty-hooks"),
        limits: Limits::default(),
    };
    std::fs::create_dir_all(&runner.empty_hooks_folder).expect("the folder is created");
    let acme = user_repository(root, "acme", &remote, &root.join("alternate-refs.ran"));
    // Both sides start from the same commit, then each changes the file.
    stdout_of(&run_checked(&runner, &acme, &ssh, "pull origin main"));
    std::fs::write(server.join("notes.md"), "one\nsam\n").expect("the file writes");
    plain_git_ok(&server, &["commit", "-q", "-a", "-m", "sam-note"]);
    std::fs::write(acme.top.join("notes.md"), "one\nmine\n").expect("the file writes");
    plain_git_ok(&acme.top, &["commit", "-q", "-a", "-m", "my-note"]);

    stdout_of(&run_checked(
        &runner,
        &acme,
        &ssh,
        "fetch --quiet --no-tags origin main",
    ));
    let base = stdout_of(&run_checked(
        &runner,
        &acme,
        &ssh,
        "merge-base HEAD FETCH_HEAD",
    ));
    let theirs = stdout_of(&run_checked(
        &runner,
        &acme,
        &ssh,
        "show FETCH_HEAD:notes.md",
    ));
    assert_eq!(theirs, "one\nsam\n");
    let original = stdout_of(&run_checked(
        &runner,
        &acme,
        &ssh,
        &format!("show {}:notes.md", base.trim()),
    ));
    assert_eq!(original, "one\n");

    stdout_of(&run_checked(
        &runner,
        &acme,
        &ssh,
        "merge --no-ff --no-commit -s ours FETCH_HEAD",
    ));
    // Both sides changed the line, and still no marker and no change.
    let file = std::fs::read_to_string(acme.top.join("notes.md")).expect("the file reads");
    assert_eq!(file, "one\nmine\n");
    assert!(acme.git_dir.join("MERGE_HEAD").exists());
    plain_git_ok(&acme.top, &["commit", "-q", "-m", "got-sams-versions"]);
    let parents = stdout_of(&run_checked(
        &runner,
        &acme,
        &ssh,
        "log --max-count=1 --format=%P",
    ));
    assert_eq!(parents.split_whitespace().count(), 2);
}

#[test]
fn git_hardening_merges_only_with_ours_whatever_a_branchs_merge_options_say() {
    let scratch = Scratch::new("merge-options");
    let root = &scratch.0;
    let top = root.join("acme");
    std::fs::create_dir_all(&top).expect("the folder is created");
    plain_git_ok(&top, &["init", "-q"]);
    std::fs::write(top.join("notes.md"), "one\n").expect("the file writes");
    std::fs::write(top.join(".gitattributes"), "notes.md merge=planted\n")
        .expect("the file writes");
    plain_git_ok(&top, &["add", "-A"]);
    plain_git_ok(&top, &["commit", "-q", "-m", "first-note"]);
    plain_git_ok(&top, &["branch", "other"]);
    std::fs::write(top.join("notes.md"), "one\nmine\n").expect("the file writes");
    plain_git_ok(&top, &["commit", "-q", "-a", "-m", "my-note"]);
    plain_git_ok(&top, &["switch", "-q", "other"]);
    std::fs::write(top.join("notes.md"), "one\nsam\n").expect("the file writes");
    plain_git_ok(&top, &["commit", "-q", "-a", "-m", "sam-note"]);
    plain_git_ok(&top, &["switch", "-q", "main"]);
    let mark = root.join("driver.ran");
    let driver = format!("touch '{}'", mark.display());
    plain_git_ok(&top, &["config", "merge.planted.driver", &driver]);
    plain_git_ok(
        &top,
        &["config", "branch.main.mergeOptions", "-s recursive"],
    );
    let git_dir = top.join(".git");
    let repository = Repository {
        top: top.clone(),
        git_dir: git_dir.clone(),
        common_dir: git_dir,
    };
    let runner = GitRunner {
        git: git_program(),
        empty_hooks_folder: root.join("empty-hooks"),
        limits: Limits::default(),
    };
    std::fs::create_dir_all(&runner.empty_hooks_folder).expect("the folder is created");
    // What the runner reads from the config for this merge.
    let entries = [ConfigEntry {
        scope: "global".to_owned(),
        key: "branch.main.mergeoptions".to_owned(),
        value: "-s recursive".to_owned(),
    }];
    let args: Vec<String> = "merge --no-ff --no-commit -s ours other"
        .split(' ')
        .map(str::to_owned)
        .collect();
    let call = check_args(&args).expect("the call is allowed");
    let output = runner
        .hardened_command(
            &top,
            Some(&repository),
            &call,
            &blank_merge_options(&entries),
        )
        .env("GIT_AUTHOR_NAME", "Acme Tester")
        .env("GIT_AUTHOR_EMAIL", "tester@acme.example")
        .env("GIT_COMMITTER_NAME", "Acme Tester")
        .env("GIT_COMMITTER_EMAIL", "tester@acme.example")
        .output()
        .expect("git runs");
    stdout_of(&output);
    assert!(!mark.exists(), "the planted merge driver ran");
    let file = std::fs::read_to_string(top.join("notes.md")).expect("the file reads");
    assert_eq!(file, "one\nmine\n");
}
