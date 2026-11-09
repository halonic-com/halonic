use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::Command;

use super::{GitRunner, remove_git_variables};
use crate::check_args::check_args;
use crate::limited_run::Limits;
use crate::repository::Repository;

fn runner() -> GitRunner {
    GitRunner {
        git: PathBuf::from("git"),
        empty_hooks_folder: PathBuf::from("empty-hooks"),
        limits: Limits::default(),
    }
}

/// The command for an allowed call, outside a repository and with no
/// overrides.
fn command(call: &str) -> Command {
    let args: Vec<String> = call.split(' ').map(str::to_owned).collect();
    let call = check_args(&args).expect("the call is allowed");
    runner().hardened_command(Path::new("."), None, &call, &[])
}

fn arguments(command: &Command) -> Vec<String> {
    command
        .get_args()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect()
}

fn environment(command: &Command, name: &str) -> Option<Option<String>> {
    command
        .get_envs()
        .find(|(key, _)| *key == OsStr::new(name))
        .map(|(_, value)| value.map(|value| value.to_string_lossy().into_owned()))
}

/// The config a command gives git in the environment, in order.
fn config(command: &Command) -> Vec<(String, String)> {
    let count: usize = environment(command, "GIT_CONFIG_COUNT")
        .flatten()
        .and_then(|count| count.parse().ok())
        .expect("the command has a config count");
    (0..count)
        .map(|index| {
            let read = |name: String| {
                environment(command, &name)
                    .flatten()
                    .expect("every entry has a key and a value")
            };
            (
                read(format!("GIT_CONFIG_KEY_{index}")),
                read(format!("GIT_CONFIG_VALUE_{index}")),
            )
        })
        .collect()
}

fn has_config(command: &Command, key: &str, value: &str) -> bool {
    config(command)
        .iter()
        .any(|(known, set)| known == key && set == value)
}

#[test]
fn git_hardening_gives_its_config_in_the_environment_not_as_arguments() {
    let command = command("status --porcelain");
    assert_eq!(arguments(&command), ["--no-pager", "status", "--porcelain"]);
    let config = config(&command);
    assert_eq!(
        config[0],
        ("core.hooksPath".to_owned(), "empty-hooks".to_owned())
    );
    for (key, value) in [
        ("core.fsmonitor", "false"),
        ("commit.gpgSign", "false"),
        ("tag.gpgSign", "false"),
        ("push.gpgSign", "false"),
        ("log.showSignature", "false"),
        ("merge.verifySignatures", "false"),
    ] {
        assert!(has_config(&command, key, value), "{key}");
    }
}

#[test]
fn git_hardening_never_goes_into_submodules() {
    let command = command("pull origin main");
    for (key, value) in [
        ("submodule.recurse", "false"),
        ("fetch.recurseSubmodules", "false"),
        ("push.recurseSubmodules", "no"),
        ("status.submoduleSummary", "false"),
        ("diff.submodule", "short"),
    ] {
        assert!(has_config(&command, key, value), "{key}");
    }
}

#[test]
fn git_hardening_runs_no_alternate_refs_command_maintenance_or_bundle() {
    let command = command("commit -m first-note");
    for (key, value) in [
        ("core.alternateRefsCommand", "true"),
        ("maintenance.auto", "false"),
        ("gc.auto", "0"),
        ("fetch.bundleURI", ""),
    ] {
        assert!(has_config(&command, key, value), "{key}");
    }
}

#[test]
fn git_hardening_turns_off_external_diffs_for_diff_and_log() {
    let all = arguments(&command("diff --cached"));
    assert_eq!(
        all[all.len() - 4..],
        ["diff", "--no-ext-diff", "--no-textconv", "--cached"]
    );
}

#[test]
fn git_hardening_names_upload_pack_and_receive_pack_itself() {
    let pull = arguments(&command("pull origin main"));
    assert_eq!(
        pull[pull.len() - 4..],
        ["pull", "--upload-pack=git-upload-pack", "origin", "main"]
    );
    let push = arguments(&command("push origin main"));
    assert_eq!(
        push[push.len() - 4..],
        ["push", "--receive-pack=git-receive-pack", "origin", "main"]
    );
}

#[test]
fn git_hardening_runs_in_the_checked_folders_with_the_overrides_last() {
    let repository = Repository {
        top: PathBuf::from("/srv/acme"),
        git_dir: PathBuf::from("/srv/acme/.git"),
        common_dir: PathBuf::from("/srv/acme/.git"),
    };
    let args = ["status".to_owned()];
    let call = check_args(&args).expect("the call is allowed");
    let overrides = [("filter.x=y.clean".to_owned(), String::new())];
    let command = runner().hardened_command(Path::new("."), Some(&repository), &call, &overrides);
    assert_eq!(
        arguments(&command),
        [
            "--no-pager",
            "--git-dir=/srv/acme/.git",
            "--work-tree=/srv/acme",
            "status"
        ]
    );
    assert_eq!(
        config(&command).last(),
        Some(&("filter.x=y.clean".to_owned(), String::new()))
    );
}

#[test]
fn git_hardening_sets_a_safe_environment() {
    let command = command("status");
    for (name, value) in [
        ("GIT_TERMINAL_PROMPT", "0"),
        ("GIT_CONFIG_NOSYSTEM", "1"),
        ("GIT_PAGER", "cat"),
        ("GIT_EDITOR", "true"),
        ("GIT_SEQUENCE_EDITOR", "true"),
        ("GIT_ASKPASS", ""),
        ("GIT_ALLOW_PROTOCOL", "https:ssh"),
        ("GIT_LITERAL_PATHSPECS", "1"),
    ] {
        assert_eq!(
            environment(&command, name),
            Some(Some(value.to_owned())),
            "{name}"
        );
    }
}

#[test]
fn git_hardening_removes_inherited_git_variables() {
    let mut command = Command::new("git");
    let inherited = [
        "GIT_DIR",
        "GIT_SSH_COMMAND",
        "git_config_parameters",
        "GIT_EXEC_PATH",
        "HOME",
        "PATH",
    ];
    remove_git_variables(&mut command, inherited.iter().map(OsString::from));
    assert_eq!(environment(&command, "GIT_DIR"), Some(None));
    assert_eq!(environment(&command, "GIT_SSH_COMMAND"), Some(None));
    assert_eq!(environment(&command, "git_config_parameters"), Some(None));
    assert_eq!(environment(&command, "GIT_EXEC_PATH"), Some(None));
    assert_eq!(environment(&command, "HOME"), None);
    assert_eq!(environment(&command, "PATH"), None);
}
