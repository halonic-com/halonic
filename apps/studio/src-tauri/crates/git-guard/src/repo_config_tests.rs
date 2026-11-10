use super::{
    ConfigEntry, add_repository_filters, blank_filters, check_listing, check_refused_keys,
    neutralise_programs, parse_listing,
};
use crate::error::GitError;

fn entry(scope: &str, key: &str, value: &str) -> ConfigEntry {
    ConfigEntry {
        scope: scope.to_owned(),
        key: key.to_owned(),
        value: value.to_owned(),
    }
}

fn pairs(overrides: &[(String, String)]) -> Vec<(&str, &str)> {
    overrides
        .iter()
        .map(|(key, value)| (key.as_str(), value.as_str()))
        .collect()
}

#[test]
fn repo_config_reads_scopes_keys_and_values_with_newlines() {
    let listing = b"global\0user.name\nAcme Tester\0local\0core.bare\nfalse\0local\0x.flag\0local\0x.text\none\ntwo\0";
    assert_eq!(
        parse_listing(listing),
        [
            entry("global", "user.name", "Acme Tester"),
            entry("local", "core.bare", "false"),
            entry("local", "x.flag", ""),
            entry("local", "x.text", "one\ntwo"),
        ]
    );
}

#[test]
fn repo_config_refuses_a_listing_git_could_not_give() {
    assert_eq!(check_listing(Some(0)), Ok(()));
    assert_eq!(check_listing(Some(1)), Err(GitError::RepositoryUnreadable));
    assert_eq!(check_listing(None), Err(GitError::RepositoryUnreadable));
}

#[test]
fn repo_config_blanks_only_the_repositorys_filters_whatever_their_name() {
    let entries = [
        entry("global", "filter.lfs.clean", "git-lfs clean -- %f"),
        entry("local", "filter.x.clean", "touch owned"),
        entry("worktree", "filter.a.b=c.smudge", "touch owned"),
        entry("local", "filter.x.process", "touch owned"),
    ];
    let mut names = Vec::new();
    add_repository_filters(&entries, &mut names);
    assert_eq!(names, ["x", "a.b=c"]);
    assert_eq!(
        pairs(&blank_filters(&names[..1])),
        [
            ("filter.x.clean", ""),
            ("filter.x.smudge", ""),
            ("filter.x.process", ""),
            ("filter.x.required", "false"),
        ]
    );
}

#[test]
fn repo_config_gives_program_keys_the_users_value_or_gits_default() {
    let entries = [
        entry("global", "core.sshcommand", "ssh -i acme-key"),
        entry("local", "core.sshcommand", "touch owned"),
        entry("local", "gpg.ssh.defaultkeycommand", "touch owned"),
        entry("local", "gpg.program", "touch owned"),
    ];
    assert_eq!(
        pairs(&neutralise_programs(&entries)),
        [
            ("core.sshcommand", "ssh -i acme-key"),
            ("gpg.program", "gpg"),
            ("gpg.ssh.defaultkeycommand", ""),
        ]
    );
}

#[test]
fn repo_config_makes_the_repositorys_merge_drivers_report_a_conflict() {
    let entries = [
        entry("local", "merge.acme.driver", "touch owned"),
        entry("local", "merge.acme.name", "Acme"),
        entry("global", "merge.mine.driver", "my-merge %A %B"),
    ];
    assert_eq!(
        pairs(&neutralise_programs(&entries)),
        [("merge.acme.driver", "exit 1")]
    );
}

#[test]
fn repo_config_sends_the_repositorys_remote_programs_back_to_gits_defaults() {
    let entries = [
        entry("local", "remote.origin.uploadPack", "touch owned"),
        entry("local", "remote.origin.uploadpack", "touch owned again"),
        entry("worktree", "remote.acme.v2.receivepack", "touch owned"),
        entry(
            "local",
            "remote.origin.url",
            "https://git.acme.example/acme.git",
        ),
        entry("global", "remote.mine.uploadpack", "my-upload-pack"),
    ];
    assert_eq!(
        pairs(&neutralise_programs(&entries)),
        [
            ("remote.origin.uploadpack", "git-upload-pack"),
            ("remote.acme.v2.receivepack", "git-receive-pack"),
        ]
    );
}

#[test]
fn repo_config_keeps_only_the_users_credential_helpers() {
    let entries = [
        entry("global", "credential.helper", "osxkeychain"),
        entry(
            "global",
            "credential.https://git.acme.example.helper",
            "acme",
        ),
        entry("local", "credential.helper", "!touch owned"),
        entry(
            "local",
            "credential.https://evil.example.helper",
            "!touch owned",
        ),
        entry("local", "credential.username", "acme"),
    ];
    assert_eq!(
        pairs(&neutralise_programs(&entries)),
        [
            ("credential.helper", ""),
            ("credential.helper", "osxkeychain"),
            ("credential.https://git.acme.example.helper", "acme"),
        ]
    );
}

#[test]
fn repo_config_leaves_a_clean_repository_as_it_is() {
    let entries = [
        entry("global", "credential.helper", "osxkeychain"),
        entry("global", "core.sshcommand", "ssh -i acme-key"),
        entry(
            "local",
            "remote.origin.url",
            "https://git.acme.example/acme.git",
        ),
        entry("local", "user.name", "Acme Tester"),
    ];
    assert!(neutralise_programs(&entries).is_empty());
    let mut names = Vec::new();
    add_repository_filters(&entries, &mut names);
    assert!(names.is_empty());
}

#[test]
fn repo_config_refuses_merge_options_from_the_repository_only() {
    assert_eq!(
        check_refused_keys(&[entry("local", "branch.Main.mergeOptions", "-F x")]),
        Err(GitError::ConfigNotAllowed {
            key: "branch.Main.mergeOptions".to_owned(),
        })
    );
    // Any branch, a name with dots, and an empty value too.
    assert!(check_refused_keys(&[entry("worktree", "branch.a.b.mergeoptions", "")]).is_err());
    assert_eq!(
        check_refused_keys(&[
            entry("global", "branch.main.mergeoptions", "--no-ff"),
            entry("local", "branch.main.merge", "refs/heads/main"),
            entry("local", "branch.mergeoptions.remote", "origin"),
        ]),
        Ok(())
    );
}

#[test]
fn repo_leaks_refuses_keys_that_redirect_or_expose_git_traffic() {
    for key in [
        "url.https://evil.example/.insteadOf",
        "url.ssh://evil.example/.pushInsteadOf",
        "remote.origin.pushurl",
        "remote.acme.example.pushUrl",
        "http.sslVerify",
        "http.https://git.acme.example/.sslverify",
        "http.sslCAInfo",
        "http.https://git.acme.example/.sslCAInfo",
        "http.sslCAPath",
        "http.https://git.acme.example/.sslcapath",
    ] {
        for scope in ["local", "worktree"] {
            assert_eq!(
                check_refused_keys(&[entry(scope, key, "x")]),
                Err(GitError::ConfigNotAllowed {
                    key: key.to_owned(),
                }),
                "{scope} {key}"
            );
        }
    }
}

#[test]
fn repo_leaks_refuses_every_config_hook_from_the_repository() {
    for key in ["hook.acme.command", "hook.acme.event", "Hook.a.b.enabled"] {
        assert!(
            check_refused_keys(&[entry("local", key, "touch owned")]).is_err(),
            "{key}"
        );
    }
}

#[test]
fn repo_leaks_keeps_the_users_own_values_and_similar_keys() {
    assert_eq!(
        check_refused_keys(&[
            entry("global", "url.https://git.acme.example/.insteadOf", "acme:"),
            entry(
                "global",
                "remote.origin.pushurl",
                "https://git.acme.example/fork.git"
            ),
            entry(
                "local",
                "remote.origin.url",
                "https://git.acme.example/acme.git"
            ),
            entry(
                "local",
                "remote.pushurl.url",
                "https://git.acme.example/acme.git"
            ),
            entry("global", "http.sslCAInfo", "acme-ca.pem"),
            entry("global", "hook.lint.command", "acme-lint"),
            entry("command", "http.sslVerify", "true"),
            entry("local", "http.sslCert", "acme-cert.pem"),
            entry("local", "http.https://git.acme.example/.extraHeader", "x"),
            entry("local", "url.https://git.acme.example/.name", "x"),
            entry("local", "core.hooksPath", "hooks"),
        ]),
        Ok(())
    );
}
