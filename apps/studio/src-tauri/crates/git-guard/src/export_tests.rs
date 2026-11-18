//! Tests for `export.rs`. Each test's name starts with `git_export_`, the
//! last part of its requirement. The address and reference checks need no
//! git; the exports run a real git against a repository on this computer,
//! reached through a stand-in `ssh` (a shell script on Unix, a `.cmd` that
//! runs the same script on Windows), since no test can reach a real server.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use super::ExportLimits;
use crate::error::GitError;
use crate::export_command::ExportPlace;
use crate::find_git::find_git;
use crate::runner::GitRunner;

/// A folder under the system's temporary folder, removed when dropped.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder = std::env::temp_dir().join(format!("git-export-{name}-{}", std::process::id()));
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

fn runner(root: &Path) -> GitRunner {
    GitRunner::new(git_program(), &root.join("empty-hooks")).expect("the runner starts")
}

/// Runs git with no hardening, to set a test up.
fn plain_git(folder: &Path, args: &[&str]) -> String {
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
    let output = command
        .current_dir(folder)
        .args(["-c", "user.name=Acme Tester"])
        .args(["-c", "user.email=tester@acme.example"])
        .args(["-c", "init.defaultBranch=main"])
        .args(args)
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_owned()
}

/// `path` with forward slashes, which sh reads on every system.
fn posix(path: &Path) -> String {
    crate::opened_folders::plain_path(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// The address of the server repository `folder`, as the stand-in ssh reaches it.
fn address_of(folder: &Path) -> String {
    let path = posix(folder);
    let slash = if path.starts_with('/') { "" } else { "/" };
    format!("ssh://git.acme.invalid{slash}{path}")
}

/// A server repository with a plugin in it, tagged `v1`, and a second
/// commit after the tag.
fn server(root: &Path) -> PathBuf {
    let server = root.join("server");
    std::fs::create_dir_all(server.join("src")).expect("the folder is created");
    plain_git(&server, &["init", "-q"]);
    std::fs::write(server.join("plugin.yaml"), "name: weather\n").expect("the file writes");
    std::fs::write(server.join("src/index.js"), "export {};\n").expect("the file writes");
    plain_git(&server, &["add", "."]);
    plain_git(&server, &["commit", "-q", "-m", "first"]);
    plain_git(&server, &["tag", "v1"]);
    std::fs::write(server.join("src/index.js"), "export const two = 2;\n")
        .expect("the file writes");
    plain_git(&server, &["commit", "-q", "-a", "-m", "second"]);
    server
}

/// A stand-in ssh that runs `script_body`, a sh script, with the ssh
/// arguments. On Windows git starts a `.cmd`, which hands them to sh.
fn local_ssh(root: &Path, script_body: &str) -> PathBuf {
    let script = root.join("local-ssh.sh");
    std::fs::write(&script, format!("#!/bin/sh\n{script_body}\n")).expect("the ssh writes");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755))
            .expect("the ssh is executable");
        script
    }
    #[cfg(windows)]
    {
        let ssh = root.join("local-ssh.cmd");
        let line = format!("@sh \"{}\" %*\r\n", posix(&script));
        std::fs::write(&ssh, line).expect("the ssh writes");
        // git hands GIT_SSH_COMMAND to sh, which eats backslashes and
        // can't read the `\\?\` prefix, so name the .cmd with forward slashes.
        PathBuf::from(posix(&ssh))
    }
}

/// An ssh that runs the command it is given (its last argument) here.
fn running_ssh(root: &Path) -> PathBuf {
    local_ssh(root, "for last; do :; done\nexec sh -c \"$last\"")
}

fn entries_of(folder: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(folder)
        .expect("the folder reads")
        .map(|entry| {
            entry
                .expect("the entry reads")
                .file_name()
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    names.sort();
    names
}

#[test]
fn git_export_writes_the_default_branch_files_and_no_git_folder() {
    let scratch = Scratch::new("default-branch");
    let root = &scratch.0;
    let server = server(root);
    let ssh = running_ssh(root);
    let parent = root.join("exports");
    let exported = runner(root)
        .export_with(
            &address_of(&server),
            None,
            &parent,
            ExportLimits::default(),
            &AtomicBool::new(false),
            Some(&ssh),
        )
        .expect("the export works");
    assert_eq!(exported.commit, plain_git(&server, &["rev-parse", "HEAD"]));
    assert_eq!(exported.branch.as_deref(), Some("main"));
    assert_eq!(
        std::fs::read_to_string(exported.files.join("src/index.js")).expect("the file reads"),
        "export const two = 2;\n"
    );
    assert_eq!(entries_of(&exported.files), ["plugin.yaml", "src"]);
    // Only the files are left: no repository, no index, no `.git`.
    assert_eq!(entries_of(&exported.work), ["files"]);
    assert_eq!(entries_of(&parent).len(), 1);
}

#[test]
fn git_export_writes_the_commit_a_tag_names() {
    let scratch = Scratch::new("tag");
    let root = &scratch.0;
    let server = server(root);
    let ssh = running_ssh(root);
    let exported = runner(root)
        .export_with(
            &address_of(&server),
            Some("v1"),
            &root.join("exports"),
            ExportLimits::default(),
            &AtomicBool::new(false),
            Some(&ssh),
        )
        .expect("the export works");
    assert_eq!(
        exported.commit,
        plain_git(&server, &["rev-parse", "v1^{commit}"])
    );
    assert_eq!(exported.branch, None);
    assert_eq!(
        std::fs::read_to_string(exported.files.join("src/index.js")).expect("the file reads"),
        "export {};\n"
    );
}

#[test]
fn git_export_refuses_a_commit_over_the_limits_before_writing_a_file() {
    let scratch = Scratch::new("limits");
    let root = &scratch.0;
    let server = server(root);
    let ssh = running_ssh(root);
    let parent = root.join("exports");
    for limits in [
        ExportLimits {
            max_entries: 1,
            ..ExportLimits::default()
        },
        ExportLimits {
            max_bytes: 10,
            ..ExportLimits::default()
        },
    ] {
        let error = runner(root)
            .export_with(
                &address_of(&server),
                None,
                &parent,
                limits,
                &AtomicBool::new(false),
                Some(&ssh),
            )
            .expect_err("the export is too large");
        assert_eq!(error, GitError::ExportTooLarge);
        assert_eq!(
            entries_of(&parent),
            Vec::<String>::new(),
            "a folder was left"
        );
    }
}

#[test]
fn git_export_removes_its_folders_when_git_fails() {
    let scratch = Scratch::new("fails");
    let root = &scratch.0;
    let server = server(root);
    let ssh = running_ssh(root);
    let parent = root.join("exports");
    let error = runner(root)
        .export_with(
            &address_of(&server),
            Some("no-such-branch"),
            &parent,
            ExportLimits::default(),
            &AtomicBool::new(false),
            Some(&ssh),
        )
        .expect_err("the branch doesn't exist");
    assert!(
        matches!(
            error,
            GitError::ExportFailed {
                step: "fetch the commit",
                ..
            }
        ),
        "{error:?}"
    );
    assert_eq!(
        entries_of(&parent),
        Vec::<String>::new(),
        "a folder was left"
    );
}

#[test]
fn git_export_refuses_a_bad_address_before_it_starts_anything() {
    let scratch = Scratch::new("refused");
    let root = &scratch.0;
    let parent = root.join("exports");
    let error = runner(root)
        .export_commit(
            "ext::sh -c touch% x",
            None,
            &parent,
            ExportLimits::default(),
            &AtomicBool::new(false),
        )
        .expect_err("the address is refused");
    assert_eq!(error.kind(), "address_not_allowed");
    assert!(!parent.exists(), "the refusal made a folder");
    let error = runner(root)
        .export_commit(
            "https://github.com/acme/weather",
            Some("--upload-pack=x"),
            &parent,
            ExportLimits::default(),
            &AtomicBool::new(false),
        )
        .expect_err("the reference is refused");
    assert_eq!(error, GitError::ReferenceNotAllowed);
    assert!(!parent.exists(), "the refusal made a folder");
}

#[test]
fn git_export_stops_before_git_when_already_cancelled() {
    let scratch = Scratch::new("cancelled-first");
    let root = &scratch.0;
    let parent = root.join("exports");
    let error = runner(root)
        .export_commit(
            "https://github.com/acme/weather",
            None,
            &parent,
            ExportLimits::default(),
            &AtomicBool::new(true),
        )
        .expect_err("the export is cancelled");
    assert_eq!(error, GitError::Cancelled);
    assert_eq!(
        entries_of(&parent),
        Vec::<String>::new(),
        "a folder was left"
    );
}

#[test]
fn git_export_stops_git_and_removes_its_folders_when_cancelled_mid_fetch() {
    let scratch = Scratch::new("cancelled-mid");
    let root = &scratch.0;
    let server = server(root);
    // An ssh that never answers, and marks that it started.
    let started = root.join("ssh.started");
    let ssh = local_ssh(root, &format!("touch '{}'\nsleep 60", posix(&started)));
    let parent = root.join("exports");
    let cancel = AtomicBool::new(false);
    let runner = runner(root);
    let begun = Instant::now();
    let error = std::thread::scope(|scope| {
        scope.spawn(|| {
            let until = Instant::now() + Duration::from_secs(20);
            while !started.exists() && Instant::now() < until {
                std::thread::sleep(Duration::from_millis(20));
            }
            cancel.store(true, Ordering::SeqCst);
        });
        runner.export_with(
            &address_of(&server),
            None,
            &parent,
            ExportLimits::default(),
            &cancel,
            Some(&ssh),
        )
    })
    .expect_err("the export is cancelled");
    assert_eq!(error, GitError::Cancelled);
    assert!(
        begun.elapsed() < Duration::from_secs(30),
        "the cancel didn't stop git"
    );
    assert_eq!(
        entries_of(&parent),
        Vec::<String>::new(),
        "a folder was left"
    );
}

#[test]
fn git_export_reads_no_user_config_and_asks_no_question() {
    let scratch = Scratch::new("environment");
    let root = &scratch.0;
    let runner = runner(root);
    let command = runner.export_command(root, &ExportPlace::default(), None);
    let environment = |name: &str| {
        command
            .get_envs()
            .find(|(key, _)| *key == std::ffi::OsStr::new(name))
            .and_then(|(_, value)| value.map(|value| value.to_string_lossy().into_owned()))
    };
    assert_eq!(
        environment("GIT_CONFIG_GLOBAL").as_deref(),
        Some("/dev/null")
    );
    assert_eq!(environment("GIT_CONFIG_NOSYSTEM").as_deref(), Some("1"));
    assert_eq!(environment("GIT_TERMINAL_PROMPT").as_deref(), Some("0"));
    assert_eq!(
        environment("GIT_ALLOW_PROTOCOL").as_deref(),
        Some("https:ssh")
    );
    assert_eq!(
        environment("GIT_SSH_COMMAND").as_deref(),
        Some("ssh -o BatchMode=yes -o ForwardAgent=no -o ClearAllForwardings=yes")
    );
    let keys: Vec<String> = (0..)
        .map_while(|index| environment(&format!("GIT_CONFIG_KEY_{index}")))
        .collect();
    for key in [
        "credential.helper",
        "core.attributesFile",
        "core.excludesFile",
        "fetch.unpackLimit",
        "transfer.fsckObjects",
    ] {
        assert!(keys.iter().any(|known| known == key), "{key} isn't blanked");
    }
}

#[path = "export_hostile_tests.rs"]
mod hostile;
