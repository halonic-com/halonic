//! Tests for `export.rs`. Each test's name starts with `git_export_`, the
//! last part of its requirement. The address and reference checks need no
//! git; the exports run a real git against a repository on this computer,
//! reached through a stand-in `ssh` (Unix only), since no test can reach a
//! real server.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::AtomicBool;
#[cfg(unix)]
use std::sync::atomic::Ordering;
#[cfg(unix)]
use std::time::{Duration, Instant};

use super::ExportLimits;
use crate::error::GitError;
use crate::export_check::{check_address, check_reference, is_full_commit_id, redact};
use crate::export_command::ExportPlace;
use crate::find_git::find_git;
use crate::runner::GitRunner;

#[test]
fn git_export_takes_only_https_and_ssh_addresses_without_secrets() {
    for address in [
        "https://github.com/acme/weather",
        "HTTPS://github.com/acme/weather.git",
        "https://token@github.com/acme/weather",
        "https://github.com:8443/acme/weather",
        "ssh://git@github.com/acme/weather",
        "ssh://git@[::1]:2222/acme/weather",
    ] {
        assert_eq!(check_address(address), Ok(()), "{address} was refused");
    }
}

#[test]
fn git_export_refuses_addresses_git_would_read_as_something_else() {
    for address in [
        "",
        "-oProxyCommand=touch x",
        "--upload-pack=touch x",
        "ext::sh -c touch% x",
        "file:///srv/acme/weather",
        "/srv/acme/weather",
        "../weather",
        "git@github.com:acme/weather",
        "git://github.com/acme/weather",
        "http://github.com/acme/weather",
        "https:github.com/acme/weather",
        "https://",
        "https:///acme/weather",
        "https://-bad.example/acme/weather",
        "ssh://-oProxyCommand=touch@github.com/acme/weather",
        "ssh://git@-bad.example/acme/weather",
        "https://github.com /acme/weather",
        "https://github.com\n/acme/weather",
        "https://github.com\\acme\\weather",
        "https://user:@github.com/acme/weather",
        "ssh://user:pw@github.com/acme/weather",
        "https://%67ithub.com/acme/weather",
    ] {
        assert!(
            matches!(
                check_address(address),
                Err(GitError::AddressNotAllowed { .. })
            ),
            "{address:?} was accepted"
        );
    }
}

#[test]
fn git_export_never_repeats_a_password_in_its_refusal() {
    // Built in pieces so no password-shaped address sits in the source.
    let address = ["https://user", ":", "hunter2", "@github.com/acme/weather"].concat();
    let error = check_address(&address).expect_err("a password is refused");
    assert!(!error.to_string().contains("hunter2"), "{error}");
}

#[test]
fn git_export_never_repeats_the_address_or_its_token_in_what_git_said() {
    let address = "https://s3cr3ttoken@github.com/acme/weather";
    let said = "fatal: unable to access 'https://s3cr3ttoken@github.com/acme/weather/': 403\n";
    let message = redact(said, address);
    assert!(!message.contains("s3cr3ttoken"), "{message}");
    assert!(!message.contains("github.com"), "{message}");
    assert!(message.starts_with("fatal: unable to access"), "{message}");
}

#[test]
fn git_export_takes_only_plain_references() {
    for reference in ["HEAD", "main", "v1.2.0", "feature/new-thing", "0123abcd"] {
        assert_eq!(
            check_reference(reference),
            Ok(()),
            "{reference} was refused"
        );
    }
    for reference in [
        "",
        "-x",
        "--upload-pack=x",
        "main..other",
        "main~1",
        "main^",
        "main:path",
        "a//b",
        "a/",
        "a.",
        "a b",
        "@{u}",
        "HEAD~1",
    ] {
        assert_eq!(
            check_reference(reference),
            Err(GitError::ReferenceNotAllowed),
            "{reference:?} was accepted"
        );
    }
}

#[test]
fn git_export_knows_a_full_commit_id() {
    assert!(is_full_commit_id(&"a".repeat(40)));
    assert!(is_full_commit_id(&"0".repeat(64)));
    assert!(!is_full_commit_id(&"a".repeat(39)));
    assert!(!is_full_commit_id(&"A".repeat(40)));
    assert!(!is_full_commit_id("main"));
}

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
#[cfg(unix)]
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

/// The address of the server repository `folder`, as the stand-in ssh reaches it.
#[cfg(unix)]
fn address_of(folder: &Path) -> String {
    format!("ssh://git.acme.invalid{}", folder.display())
}

/// A server repository with a plugin in it, tagged `v1`, and a second
/// commit after the tag.
#[cfg(unix)]
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

#[cfg(unix)]
fn local_ssh(root: &Path, script_body: &str) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;
    let ssh = root.join("local-ssh");
    std::fs::write(&ssh, format!("#!/bin/sh\n{script_body}\n")).expect("the ssh writes");
    std::fs::set_permissions(&ssh, std::fs::Permissions::from_mode(0o755))
        .expect("the ssh is executable");
    ssh
}

/// An ssh that runs the command it is given (its last argument) here.
#[cfg(unix)]
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

#[cfg(unix)]
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

#[cfg(unix)]
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

#[cfg(unix)]
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

#[cfg(unix)]
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

#[cfg(unix)]
#[test]
fn git_export_stops_git_and_removes_its_folders_when_cancelled_mid_fetch() {
    let scratch = Scratch::new("cancelled-mid");
    let root = &scratch.0;
    let server = server(root);
    // An ssh that never answers, and marks that it started.
    let started = root.join("ssh.started");
    let ssh = local_ssh(root, &format!("touch '{}'\nsleep 60", started.display()));
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
        Some("ssh -o BatchMode=yes")
    );
    let keys: Vec<String> = (0..)
        .map_while(|index| environment(&format!("GIT_CONFIG_KEY_{index}")))
        .collect();
    for key in [
        "credential.helper",
        "core.attributesFile",
        "core.excludesFile",
    ] {
        assert!(keys.iter().any(|known| known == key), "{key} isn't blanked");
    }
}
