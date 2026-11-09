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
