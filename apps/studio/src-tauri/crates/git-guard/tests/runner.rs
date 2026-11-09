//! The runner against real git, in temporary repositories. Each test plants
//! what an attacker who can write the opened folder could plant, and checks
//! that the call still works and that nothing planted ran.

mod support;

use halonic_git_guard::GitError;
use support::{Sandbox, config_value, plain_git_ok};
// The tests that plant programs run them through a Unix shell.
#[cfg(unix)]
use support::plain_git;

#[test]
fn git_hardening_commits_in_an_opened_folder() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.write("notes.md", "acme notes\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m first-note");
    assert_eq!(sandbox.git_ok("log --format=%s"), "first-note\n");
}

#[cfg(unix)]
#[test]
fn git_hardening_never_runs_a_planted_hook() {
    use std::os::unix::fs::PermissionsExt;

    let sandbox = Sandbox::new();
    sandbox.init_repository();
    let hook = sandbox.acme.join(".git").join("hooks").join("pre-commit");
    std::fs::write(&hook, format!("#!/bin/sh\n{}\n", sandbox.planted("hook")))
        .expect("the hook writes");
    std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755))
        .expect("the hook is executable");
    sandbox.write("notes.md", "acme notes\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m first-note");
    assert_eq!(sandbox.marks(), Vec::<String>::new());
}

#[cfg(unix)]
#[test]
fn git_hardening_never_runs_a_signing_program() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    let key = sandbox.planted_script("key");
    let sign = sandbox.planted_script("sign");
    let gpg = sandbox.planted_script("gpg");
    sandbox.append_config(&format!(
        "[commit]\n\tgpgSign = true\n[tag]\n\tgpgSign = true\n[log]\n\tshowSignature = true\n\
         [gpg]\n\tformat = ssh\n\tprogram = {}\n[gpg \"ssh\"]\n\tdefaultKeyCommand = {}\n\tprogram = {}\n",
        gpg.display(),
        key.display(),
        sign.display()
    ));
    sandbox.write("notes.md", "acme notes\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m signed-note");
    sandbox.git_ok("log --format=%H%G?");
    assert_eq!(sandbox.marks(), Vec::<String>::new());
    // Without the runner, the commit asks the planted key command.
    plain_git(
        &sandbox.acme,
        &["commit", "--allow-empty", "-m", "unsigned"],
    );
    assert_eq!(sandbox.marks(), ["key.ran"]);
}

#[cfg(unix)]
#[test]
fn git_hardening_never_runs_a_pager_editor_or_diff_program_in_the_config() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    let fsmonitor = sandbox.planted_script("fsmonitor");
    let program = |name: &str| sandbox.planted(name);
    sandbox.append_config(&format!(
        "[core]\n\tfsmonitor = {}\n\tpager = {}\n\teditor = {}\n\taskPass = {}\n\
         [sequence]\n\teditor = {}\n[pager]\n\tlog = {}\n\
         [diff]\n\texternal = {}\n[diff \"x\"]\n\tcommand = {}\n\ttextconv = {}\n",
        fsmonitor.display(),
        program("pager"),
        program("editor"),
        program("askpass"),
        program("sequence"),
        program("pager-log"),
        program("external"),
        program("diff-command"),
        program("textconv"),
    ));
    sandbox.write(".git/info/attributes", "* diff=x\n");
    sandbox.write("notes.md", "acme notes\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m first-note");
    sandbox.write("notes.md", "acme notes, changed\n");
    sandbox.git_ok("status");
    sandbox.git_ok("diff");
    sandbox.git_ok("log -p");
    sandbox.git_ok("commit --amend --no-edit");
    assert_eq!(sandbox.marks(), Vec::<String>::new());
}

#[cfg(unix)]
#[test]
fn repo_config_neutralises_a_planted_filter_and_keeps_the_content() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    let filter = sandbox.planted("filter");
    // A name with `=` in it, which `-c` would split in the wrong place.
    for name in ["x", "a=b"] {
        sandbox.append_config(&format!(
            "[filter \"{name}\"]\n\tclean = {filter}\n\tsmudge = {filter}\n\tprocess = {filter}\n\trequired = true\n"
        ));
    }
    sandbox.write(".git/info/attributes", "*.md filter=x\n*.txt filter=a=b\n");
    sandbox.write("notes.md", "acme notes\n");
    sandbox.write("todo.txt", "acme todo\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m first-note");
    std::fs::remove_file(sandbox.acme.join("notes.md")).expect("the file is removed");
    sandbox.git_ok("checkout -- notes.md");
    assert_eq!(sandbox.git_ok("diff HEAD --stat"), "");
    assert_eq!(sandbox.marks(), Vec::<String>::new());
    // Without the runner, the same repository runs the filter.
    sandbox.write("notes.md", "changed\n");
    plain_git(&sandbox.acme, &["add", "-A"]);
    assert_eq!(sandbox.marks(), ["filter.ran"]);
}

#[cfg(unix)]
#[test]
fn repo_config_follows_includes() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.write(
        "extra.config",
        &format!("[filter \"x\"]\n\tclean = {}\n", sandbox.planted("filter")),
    );
    sandbox.append_config("[include]\n\tpath = ../extra.config\n");
    sandbox.write(".git/info/attributes", "* filter=x\n");
    sandbox.write("notes.md", "acme notes\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("status");
    assert_eq!(sandbox.marks(), Vec::<String>::new());
}

#[cfg(unix)]
#[test]
fn repo_config_neutralises_the_filters_of_a_nested_repository() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    let vendor = sandbox.acme.join("vendor");
    std::fs::create_dir_all(&vendor).expect("vendor is created");
    plain_git_ok(&vendor, &["init", "-q"]);
    std::fs::write(vendor.join("lib.md"), "1\n").expect("the file writes");
    plain_git_ok(&vendor, &["add", "lib.md"]);
    plain_git_ok(&vendor, &["commit", "-q", "-m", "lib"]);
    plain_git_ok(
        &vendor,
        &["config", "filter.x.clean", &sandbox.planted("nested")],
    );
    std::fs::write(vendor.join(".git/info/attributes"), "* filter=x\n")
        .expect("the attributes write");
    sandbox.write("notes.md", "acme notes\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m with-vendor");
    // The same content written again: git can only tell it is unchanged by
    // running the filter on it, inside the nested repository.
    let touch = || std::fs::write(vendor.join("lib.md"), "1\n").expect("the file writes");
    for call in ["add -A", "status", "diff"] {
        touch();
        sandbox.git_ok(call);
    }
    assert_eq!(sandbox.marks(), Vec::<String>::new());
    touch();
    plain_git(&sandbox.acme, &["status"]);
    assert_eq!(sandbox.marks(), ["nested.ran"]);
}

#[test]
fn repo_config_refuses_a_nested_repository_it_cannot_locate() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    let vendor = sandbox.temporary.folder("acme/vendor");
    plain_git_ok(&vendor, &["init", "-q"]);
    std::fs::write(vendor.join("lib.md"), "1\n").expect("the file writes");
    plain_git_ok(&vendor, &["add", "lib.md"]);
    plain_git_ok(&vendor, &["commit", "-q", "-m", "lib"]);
    sandbox.git_ok("add -A");
    // Once it is a gitlink, its `.git` points at a folder that isn't there.
    std::fs::remove_dir_all(vendor.join(".git")).expect("the git folder is removed");
    std::fs::write(vendor.join(".git"), "gitdir: ../missing\n").expect("the git file writes");
    assert_eq!(sandbox.git("status"), Err(GitError::RepositoryUnreadable));
}

#[cfg(unix)]
#[test]
fn repo_config_neutralises_a_planted_ssh_command() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.append_config(&format!(
        "[core]\n\tsshCommand = {}\n[remote \"origin\"]\n\turl = ssh://git.acme.invalid/acme.git\n",
        sandbox.planted("ssh")
    ));
    sandbox.write("notes.md", "acme notes\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m first-note");
    // The remote can't be reached; all that matters is that the planted
    // command did not stand in for ssh.
    let push = sandbox
        .git("push origin main")
        .expect("push runs and fails");
    assert_ne!(push.code, Some(0));
    assert_eq!(sandbox.marks(), Vec::<String>::new());
    // Without the runner, the push runs the planted command.
    plain_git(&sandbox.acme, &["push", "origin", "main"]);
    assert_eq!(sandbox.marks(), ["ssh.ran"]);
}

#[test]
fn git_hardening_refuses_an_ext_remote_already_in_the_config() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    let url = format!("ext::sh -c {}", sandbox.planted("ext").replace(' ', "% "));
    sandbox.append_config(&format!(
        "[protocol \"ext\"]\n\tallow = always\n[remote \"origin\"]\n\turl = {}\n",
        config_value(&url)
    ));
    let pull = sandbox
        .git("pull origin main")
        .expect("pull runs and fails");
    assert_ne!(pull.code, Some(0));
    let stderr = String::from_utf8_lossy(&pull.stderr);
    assert!(stderr.contains("transport 'ext' not allowed"), "{stderr}");
    assert_eq!(sandbox.marks(), Vec::<String>::new());
}

#[cfg(unix)]
#[test]
fn git_hardening_refuses_a_local_remote_whose_own_hooks_would_run() {
    use std::os::unix::fs::PermissionsExt;

    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.write("notes.md", "acme notes\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m first-note");
    // A bare repository inside the opened folder, with its own hook.
    let remote = sandbox.acme.join("remote.git");
    plain_git_ok(&sandbox.acme, &["init", "-q", "--bare", "remote.git"]);
    let hook = remote.join("hooks").join("post-receive");
    std::fs::write(
        &hook,
        format!("#!/bin/sh\n{}\n", sandbox.planted("remote-hook")),
    )
    .expect("the hook writes");
    std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755))
        .expect("the hook is executable");
    sandbox.append_config("[remote \"origin\"]\n\turl = ./remote.git\n");
    let push = sandbox
        .git("push origin main")
        .expect("push runs and fails");
    assert_ne!(push.code, Some(0));
    let stderr = String::from_utf8_lossy(&push.stderr);
    assert!(stderr.contains("transport 'file' not allowed"), "{stderr}");
    assert_eq!(sandbox.marks(), Vec::<String>::new());
    // Without the runner, the push runs the remote's hook.
    plain_git_ok(&sandbox.acme, &["push", "-q", "origin", "main"]);
    assert_eq!(sandbox.marks(), ["remote-hook.ran"]);
}

#[test]
fn git_hardening_refuses_a_hooks_folder_with_files() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.temporary.folder("empty-hooks/pre-commit");
    assert_eq!(sandbox.git("status"), Err(GitError::HooksFolderNotEmpty));
}

#[test]
fn git_hardening_refuses_a_hooks_folder_that_is_gone() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    std::fs::remove_dir(sandbox.temporary.path().join("empty-hooks"))
        .expect("the hooks folder is removed");
    assert_eq!(sandbox.git("status"), Err(GitError::HooksFolderUnreadable));
}
