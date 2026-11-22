//! A call that would store or write files without a blanked filter is
//! refused before git starts (requirement `filter-writes`). The filters
//! here name programs that don't exist: the runner blanks every filter, so
//! none would run anyway, and what matters is what git would store.

mod support;

use halonic_git_guard::GitError;
use support::{Sandbox, config_path, plain_git_ok};

const FILTER: &str = "[filter \"x\"]\n\tclean = acme-clean\n\tsmudge = acme-smudge\n";

fn refused(subcommand: &str) -> Result<(), GitError> {
    Err(GitError::FilterNotRun {
        subcommand: subcommand.to_owned(),
        filter: "x".to_owned(),
    })
}

fn answer(sandbox: &Sandbox, call: &str) -> Result<(), GitError> {
    sandbox.git(call).map(|_| ())
}

#[test]
fn filter_writes_refuses_to_stage_a_file_a_blanked_filter_would_clean() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.append_config(FILTER);
    sandbox.write(".git/info/attributes", "*.md filter=x\n");
    sandbox.write("notes.md", "acme notes\n");
    let error = sandbox.git("add -A").expect_err("add is refused");
    assert_eq!(error.kind(), "filter_not_run");
    assert_eq!(Err(error), refused("add"));
    assert_eq!(sandbox.git_ok("ls-files"), "");
    // Calls that only read, or store nothing, still run.
    sandbox.git_ok("status --porcelain");
    sandbox.git_ok("diff");
    sandbox.git_ok("add --dry-run -A");
    assert_eq!(sandbox.git_ok("ls-files"), "");
}

#[test]
fn filter_writes_reads_every_attribute_file_git_would() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.append_config(FILTER);
    sandbox.write("notes.md", "acme notes\n");
    // An untracked `.gitattributes` in a folder, and a macro.
    sandbox.write("docs/.gitattributes", "[attr]acme filter=x\n*.md acme\n");
    assert_eq!(answer(&sandbox, "add -A"), refused("add"));
    std::fs::remove_dir_all(sandbox.acme.join("docs")).expect("docs is removed");
    // The user's own attributes file, which the config names.
    let user = sandbox.temporary.path().join("user-attributes");
    std::fs::write(&user, "*.md filter=x\n").expect("the file writes");
    sandbox.append_config(&format!(
        "[core]\n\tattributesFile = {}\n",
        config_path(&user)
    ));
    assert_eq!(answer(&sandbox, "add -A"), refused("add"));
    std::fs::write(&user, "").expect("the file writes");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m first-note");
    // A `.gitattributes` still in the index, though not in the working
    // tree. Staging it runs no filter: no pattern picks one for it.
    sandbox.write(".gitattributes", "*.md filter=x\n");
    plain_git_ok(&sandbox.acme, &["add", ".gitattributes"]);
    std::fs::remove_file(sandbox.acme.join(".gitattributes")).expect("the file is removed");
    sandbox.write("todo.md", "acme todo\n");
    assert_eq!(answer(&sandbox, "add -A"), refused("add"));
}

#[test]
fn filter_writes_refuses_a_checkout_that_would_write_files_unfiltered() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.write("notes.md", "acme notes\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m first-note");
    // A branch that starts using the filter, made before it was defined.
    sandbox.git_ok("switch -c topic");
    sandbox.write(".gitattributes", "*.bin filter=x\n");
    sandbox.write("data.bin", "acme pointer\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m use-filter");
    sandbox.git_ok("switch main");
    sandbox.append_config(FILTER);
    for call in [
        "checkout topic",
        "switch topic",
        "reset --hard topic",
        "checkout topic -- data.bin",
    ] {
        let subcommand = call.split(' ').next().unwrap_or_default();
        assert_eq!(answer(&sandbox, call), refused(subcommand), "{call}");
    }
    assert_eq!(sandbox.git_ok("rev-parse --abbrev-ref HEAD"), "main\n");
    assert!(!sandbox.acme.join("data.bin").exists());
    // A new branch where HEAD is writes no file.
    sandbox.git_ok("switch -c other");
    // A commit of what is already staged stores it as staged.
    sandbox.write("notes.md", "changed\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m second-note");
    sandbox.write("notes.md", "changed again\n");
    sandbox.write(".gitattributes", "*.md filter=x\n");
    assert_eq!(
        answer(&sandbox, "commit -m third-note -- notes.md"),
        refused("commit")
    );
}

#[test]
fn filter_writes_lets_a_call_through_when_no_attribute_names_a_blanked_filter() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    sandbox.append_config(FILTER);
    sandbox.write(
        ".gitattributes",
        "# *.md filter=x\n*.md filter=other -text\n*.txt -filter\n",
    );
    sandbox.write("notes.md", "acme notes\n");
    sandbox.write("todo.txt", "acme todo\n");
    sandbox.git_ok("add -A");
    sandbox.git_ok("commit -m first-note");
    sandbox.git_ok("switch -c topic main");
    assert_eq!(
        sandbox.git_ok("ls-files"),
        ".gitattributes\nnotes.md\ntodo.txt\n"
    );
}
