//! Config keys that run a program or read a file, found in the audit in
//! `docs/config-keys.md`. Each test plants the key in the repository's own
//! config, checks that the runner's call still works and that nothing
//! planted ran or was read, then shows that plain git does run or read it.

mod support;

use halonic_git_guard::GitError;
use support::{Sandbox, config_path, config_value, plain_git, plain_git_ok};

#[test]
fn git_allow_list_never_takes_a_commit_message_from_a_template() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    let secret = sandbox.temporary.path().join("secret.txt");
    std::fs::write(&secret, "outside secret\n").expect("the secret writes");
    sandbox.append_config(&format!(
        "[commit]\n\ttemplate = {}\n",
        config_path(&secret)
    ));
    assert_eq!(
        sandbox.git("commit --allow-empty --allow-empty-message"),
        Err(GitError::MessageRequired)
    );
    sandbox.git_ok("commit --allow-empty -m first-note");
    assert_eq!(sandbox.git_ok("log --format=%B"), "first-note\n\n");
    // Without the runner, the template outside becomes the message.
    plain_git_ok(
        &sandbox.acme,
        &[
            "-c",
            "core.editor=true",
            "commit",
            "-q",
            "--allow-empty",
            "--allow-empty-message",
        ],
    );
    assert_eq!(sandbox.git_ok("log -n 1 --format=%B"), "outside secret\n\n");
}

#[test]
fn git_hardening_never_reads_a_bundle_the_config_names() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.write("notes.md", "acme notes\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m first-note");
    // A bundle outside the opened folder, of another repository.
    let private = sandbox.temporary.folder("private");
    plain_git_ok(&private, &["init", "-q"]);
    std::fs::write(private.join("plan.md"), "private plan\n").expect("the file writes");
    plain_git_ok(&private, &["add", "plan.md"]);
    plain_git_ok(&private, &["commit", "-q", "-m", "private"]);
    let bundle = sandbox.temporary.path().join("private.bundle");
    let bundle_path = bundle.to_string_lossy().into_owned();
    plain_git_ok(&private, &["bundle", "create", "-q", &bundle_path, "--all"]);
    sandbox.append_config(&format!(
        "[fetch]\n\tbundleURI = {}\n[remote \"origin\"]\n\turl = https://git.acme.invalid/acme.git\n",
        config_path(&bundle)
    ));
    // The remote can't be reached; all that matters is what was read
    // before git tried it.
    let pull = sandbox
        .git("pull --ff-only origin main")
        .expect("pull runs and fails");
    assert_ne!(pull.code, Some(0));
    let refs = || {
        let output = plain_git(&sandbox.acme, &["for-each-ref", "--format=%(refname)"]);
        String::from_utf8_lossy(&output.stdout).into_owned()
    };
    assert_eq!(refs(), "refs/heads/main\n");
    // Without the runner, the pull takes the other repository in.
    plain_git(&sandbox.acme, &["pull", "origin", "main"]);
    assert!(refs().contains("refs/bundles/"), "{}", refs());
}

// The tests below plant programs, which run through a Unix shell.

#[cfg(unix)]
#[test]
fn git_hardening_never_runs_a_submodule_diff_program() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    let vendor = sandbox.temporary.folder("acme/vendor");
    plain_git_ok(&vendor, &["init", "-q"]);
    std::fs::write(vendor.join("lib.md"), "1\n").expect("the file writes");
    plain_git_ok(&vendor, &["add", "lib.md"]);
    plain_git_ok(&vendor, &["commit", "-q", "-m", "lib"]);
    let external = sandbox.planted_script("external");
    plain_git_ok(
        &vendor,
        &["config", "diff.external", &external.to_string_lossy()],
    );
    sandbox.append_config("[diff]\n\tsubmodule = diff\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m with-vendor");
    std::fs::write(vendor.join("lib.md"), "2\n").expect("the file writes");
    plain_git_ok(&vendor, &["commit", "-q", "-a", "-m", "lib-2"]);
    let diff = sandbox.git_ok("diff");
    // The short form: the two commits, nothing from inside the submodule.
    assert!(diff.contains("+Subproject commit"), "{diff}");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m vendor-2");
    sandbox.git_ok("log -p");
    assert_eq!(sandbox.marks(), Vec::<String>::new());
    // Without the runner, `log -p` runs the submodule's own diff program.
    plain_git(&sandbox.acme, &["log", "-p"]);
    assert_eq!(sandbox.marks(), ["external.ran"]);
}

#[cfg(unix)]
#[test]
fn git_hardening_runs_no_automatic_maintenance_or_its_hook() {
    use std::time::{Duration, SystemTime};

    let sandbox = Sandbox::new();
    sandbox.init_repository();
    // Two packs and an unreachable object old enough to be pruned: the
    // next commit is due for maintenance, which asks the hook.
    for note in ["first", "second"] {
        sandbox.write(&format!("{note}.md"), "acme notes\n");
        sandbox.git_ok("add -A");
        sandbox.git_ok(&format!("commit -m {note}-note"));
        plain_git_ok(&sandbox.acme, &["repack", "-q"]);
    }
    let dangling = sandbox.temporary.path().join("dangling.txt");
    std::fs::write(&dangling, "never committed\n").expect("the file writes");
    let output = plain_git(
        &sandbox.acme,
        &["hash-object", "-w", &dangling.to_string_lossy()],
    );
    let object = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    let loose = sandbox
        .acme
        .join(".git/objects")
        .join(&object[..2])
        .join(&object[2..]);
    let old = SystemTime::now() - Duration::from_secs(365 * 24 * 60 * 60);
    // git writes objects read-only; the owner may still set their time.
    std::fs::File::open(&loose)
        .and_then(|file| file.set_modified(old))
        .expect("the object is made old");
    sandbox.append_config(&format!(
        "[gc]\n\tautoPackLimit = 1\n\tautoDetach = false\n\trecentObjectsHook = {}\n",
        sandbox.planted("recent")
    ));
    sandbox.git_ok("commit --allow-empty -m third-note");
    assert_eq!(sandbox.marks(), Vec::<String>::new());
    // Without the runner, the commit starts maintenance, which runs the hook.
    plain_git_ok(&sandbox.acme, &["commit", "-q", "--allow-empty", "-m", "x"]);
    assert_eq!(sandbox.marks(), ["recent.ran"]);
}

#[test]
fn repo_config_refuses_a_repository_that_sets_merge_options() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.git_ok("commit --allow-empty -m first-note");
    // A second repository the pull merges from, one commit apart.
    let upstream = sandbox.temporary.folder("upstream");
    let acme = sandbox.acme.to_string_lossy().into_owned();
    plain_git_ok(&upstream, &["clone", "-q", &acme, "."]);
    plain_git_ok(
        &upstream,
        &["commit", "-q", "--allow-empty", "-m", "upstream"],
    );
    sandbox.git_ok("commit --allow-empty -m second-note");
    let secret = sandbox.temporary.path().join("secret.txt");
    std::fs::write(&secret, "outside secret\n").expect("the secret writes");
    // Single quotes keep a Windows path's backslashes as they are.
    let options = format!("-F '{}'", secret.to_string_lossy());
    sandbox.append_config(&format!(
        "[remote \"origin\"]\n\turl = {}\n[branch \"main\"]\n\tmergeOptions = {}\n",
        config_path(&upstream),
        config_value(&options)
    ));
    let refused = Err(GitError::ConfigNotAllowed {
        key: "branch.main.mergeoptions".to_owned(),
    });
    assert_eq!(sandbox.git("pull --ff-only origin main"), refused);
    assert_eq!(sandbox.git("status"), refused);
    // Without the runner, the pull's merge takes the file outside as its
    // message.
    plain_git_ok(
        &sandbox.acme,
        &[
            "-c",
            "core.editor=true",
            "pull",
            "-q",
            "--no-rebase",
            "--no-edit",
            "origin",
            "main",
        ],
    );
    let output = plain_git(&sandbox.acme, &["log", "-n", "1", "--format=%B"]);
    assert_eq!(
        String::from_utf8_lossy(&output.stdout),
        "outside secret\n\n"
    );
}

#[test]
fn repo_leaks_refuses_a_repository_that_redirects_its_remote() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.append_config(
        "[url \"https://evil.example/\"]\n\tinsteadOf = https://git.acme.example/\n[http]\n\tsslVerify = false\n",
    );
    // The first refused key in the listing is named.
    assert_eq!(
        sandbox.git("status"),
        Err(GitError::ConfigNotAllowed {
            key: "url.https://evil.example/.insteadof".to_owned(),
        })
    );
}

#[test]
fn repo_leaks_refuses_a_planted_push_url() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.append_config(
        "[remote \"origin\"]\n\turl = https://git.acme.example/acme.git\n\tpushurl = https://evil.example/acme.git\n",
    );
    assert_eq!(
        sandbox.git("status"),
        Err(GitError::ConfigNotAllowed {
            key: "remote.origin.pushurl".to_owned(),
        })
    );
}

#[test]
fn repo_leaks_refuses_a_repository_that_names_a_config_hook() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.append_config(&format!(
        "[hook \"acme\"]\n\tevent = pre-commit\n\tcommand = {}\n",
        config_value(&sandbox.planted("hook"))
    ));
    assert_eq!(
        sandbox.git("commit --allow-empty -m note"),
        Err(GitError::ConfigNotAllowed {
            key: "hook.acme.event".to_owned(),
        })
    );
    assert!(sandbox.marks().is_empty());
}

#[test]
fn repo_config_refuses_a_repository_that_names_an_lfs_program() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.git_ok("status");
    for (section, key) in [
        ("lfs \"extension.acme\"", "lfs.extension.acme.clean"),
        (
            "lfs \"customtransfer.acme\"",
            "lfs.customtransfer.acme.path",
        ),
        ("lfs", "lfs.standalonetransferagent"),
    ] {
        let name = key.rsplit('.').next().unwrap_or_default();
        let config = sandbox.acme.join(".git").join("config");
        let clean = std::fs::read_to_string(&config).expect("the config reads");
        sandbox.append_config(&format!(
            "[{section}]\n\t{name} = {}\n",
            config_value(&sandbox.planted("lfs"))
        ));
        assert_eq!(
            sandbox.git("status"),
            Err(GitError::ConfigNotAllowed {
                key: key.to_owned()
            }),
            "{key}"
        );
        std::fs::write(&config, clean).expect("the config writes");
    }
    assert!(sandbox.marks().is_empty());
}

/// The credential and trace2 keys the tests plant, as section, name, the
/// key as git lists it and the file the value names.
const HELPER_KEYS: &[(&str, &str, &str, &str)] = &[
    (
        "credential",
        "trace",
        "credential.trace",
        "credential.trace",
    ),
    ("trace2", "eventTarget", "trace2.eventtarget", "trace2.json"),
];

#[test]
fn repo_config_refuses_a_repository_that_configures_the_credential_helper() {
    for (section, name, key, file) in HELPER_KEYS {
        let sandbox = Sandbox::new();
        sandbox.init_repository();
        sandbox.git_ok("status");
        let target = sandbox.temporary.path().join(file);
        sandbox.append_config(&format!(
            "[remote \"origin\"]\n\turl = https://git.acme.invalid/acme.git\n[{section}]\n\t{name} = {}\n",
            config_path(&target)
        ));
        let refused = Err(GitError::ConfigNotAllowed {
            key: (*key).to_owned(),
        });
        assert_eq!(sandbox.git("status"), refused, "{key}");
        assert_eq!(
            sandbox.git("fetch --quiet --no-tags origin"),
            refused,
            "{key}"
        );
        assert!(!target.exists(), "{key}");
    }
}

/// Set in the child process, to the made-up home.
#[cfg(unix)]
const CHILD_HOME: &str = "HALONIC_GIT_GUARD_CONFIG_KEYS_HOME";

/// The user's own values for the same keys still apply. The user's config is
/// the global one, which git finds through `HOME`, so the test runs itself
/// again as a child process with a made-up home, as `trusted_filters.rs`
/// does.
#[cfg(unix)]
#[test]
#[allow(
    clippy::disallowed_methods,
    reason = "a test's programs share its console"
)]
fn repo_config_keeps_the_users_own_credential_and_trace2_keys() {
    const TEST_NAME: &str = "repo_config_keeps_the_users_own_credential_and_trace2_keys";
    if let Some(home) = std::env::var_os(CHILD_HOME) {
        return check_users_own_keys(std::path::Path::new(&home));
    }
    let home = support::TemporaryFolder::new();
    let mut config = String::new();
    for (section, name, _, file) in HELPER_KEYS {
        let target = home.path().join(file);
        config.push_str(&format!(
            "[{section}]\n\t{name} = {}\n",
            config_path(&target)
        ));
    }
    std::fs::write(home.path().join(".gitconfig"), config).expect("the config writes");
    let child =
        std::process::Command::new(std::env::current_exe().expect("the test knows its program"))
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

/// The checks, in a process whose home sets the keys.
#[cfg(unix)]
fn check_users_own_keys(home: &std::path::Path) {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.append_config("[remote \"origin\"]\n\turl = https://git.acme.invalid/acme.git\n");
    sandbox.git_ok("status");
    // The host doesn't exist, so the fetch runs and fails to connect.
    let fetch = sandbox
        .git("fetch --quiet --no-tags origin")
        .expect("fetch runs");
    assert_ne!(fetch.code, Some(0));
    // git writes its own trace where the user's config says.
    assert!(home.join("trace2.json").exists());
}

#[test]
fn no_lazy_fetch_refuses_a_repository_that_is_a_partial_clone() {
    for (text, key) in [
        (
            "[extensions]\n\tpartialClone = planted\n",
            "extensions.partialclone",
        ),
        (
            "[remote \"planted\"]\n\turl = https://planted.invalid/a.git\n\tpromisor = true\n",
            "remote.planted.promisor",
        ),
    ] {
        let sandbox = Sandbox::new();
        sandbox.init_repository();
        sandbox.git_ok("status");
        sandbox.append_config(text);
        assert_eq!(
            sandbox.git("status"),
            Err(GitError::ConfigNotAllowed {
                key: key.to_owned()
            }),
            "{key}"
        );
    }
}
