use super::{
    named_filter, open_without_waiting, passes_content, read_attribute_file, target_revisions,
};
use crate::check_args::{CheckedCall, check_args};
use crate::error::GitError;

fn call(text: &str) -> CheckedCall {
    let args: Vec<String> = text.split(' ').map(str::to_owned).collect();
    check_args(&args).expect("the call is allowed")
}

fn filters(names: &[&str]) -> Vec<String> {
    names.iter().map(|name| (*name).to_owned()).collect()
}

#[test]
fn filter_writes_counts_only_the_calls_that_store_or_write_files() {
    for text in [
        "add -A",
        "add -- notes.md",
        "commit -m first-note -- notes.md",
        "commit --amend --no-edit notes.md",
        "reset --hard",
        "reset --hard main",
        "pull --ff-only origin main",
        "checkout main",
        "checkout -- notes.md",
        "checkout -b topic main",
        "switch main",
        "switch -c topic main",
    ] {
        assert!(passes_content(&call(text)), "{text}");
    }
    for text in [
        "status --porcelain",
        "diff",
        "log -p",
        "add --dry-run -A",
        "commit -m first-note",
        "commit -m notes.md",
        "commit --amend --no-edit",
        "reset",
        "reset --mixed -- notes.md",
        "rm --cached notes.md",
        "clean -f",
        "checkout -b topic",
        "switch -c topic",
        "merge --abort",
        "fetch origin",
        "push origin main",
    ] {
        assert!(!passes_content(&call(text)), "{text}");
    }
}

#[test]
fn filter_writes_reads_the_revisions_a_call_brings_in() {
    assert_eq!(
        target_revisions(&call("checkout main -- notes.md")),
        ["main"]
    );
    assert_eq!(target_revisions(&call("switch -c topic main")), ["main"]);
    assert_eq!(target_revisions(&call("reset --hard main")), ["main"]);
    assert_eq!(target_revisions(&call("pull --ff-only")), ["@{upstream}"]);
    assert_eq!(
        target_revisions(&call("pull --ff-only origin")),
        ["@{upstream}"]
    );
    assert_eq!(
        target_revisions(&call(
            "pull --ff-only origin main +topic refs/heads/next:next"
        )),
        [
            "@{upstream}",
            "refs/remotes/origin/main",
            "refs/remotes/origin/topic",
            "refs/remotes/origin/next",
        ]
    );
    assert!(target_revisions(&call("checkout -- main")).is_empty());
    assert!(target_revisions(&call("add -A")).is_empty());
}

#[test]
fn filter_writes_finds_a_blanked_filter_in_patterns_and_macros_only() {
    let blanked = filters(&["lfs", "a=b"]);
    for text in [
        "*.psd filter=lfs diff=lfs merge=lfs -text\n",
        "  docs/*.bin\tfilter=lfs\n",
        "[attr]big filter=lfs -text\n*.psd big\n",
        "*.txt filter=a=b\n",
    ] {
        assert!(named_filter(text, &blanked).is_some(), "{text:?}");
    }
    assert_eq!(
        named_filter("*.a filter=other\n*.b filter=lfs\n", &blanked),
        Some("lfs".to_owned())
    );
    for text in [
        "",
        "# *.psd filter=lfs\n",
        "*.psd -filter !filter filter\n",
        "*.psd filter=lfs-other filter=LFS\n",
        "*.psd filter=other\n",
    ] {
        assert_eq!(named_filter(text, &blanked), None, "{text:?}");
    }
}

#[test]
fn filter_writes_reads_only_a_regular_attribute_file_within_the_limit() {
    let root = std::env::temp_dir().join(format!("git-guard-attributes-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(root.join("folder")).expect("the folder is created");
    let small = root.join("small");
    std::fs::write(&small, "*.md filter=x\n").expect("the file writes");
    let large = root.join("large");
    std::fs::write(&large, "*.md -text\n".repeat(4)).expect("the file writes");
    let limit = 16;
    let results = [
        read_attribute_file(&small, limit),
        read_attribute_file(&large, limit),
        read_attribute_file(&root.join("folder"), limit),
        read_attribute_file(&root.join("missing"), limit),
    ];
    std::fs::remove_dir_all(&root).expect("the folder is removed");
    assert_eq!(results[0], Ok("*.md filter=x\n".to_owned()));
    assert_eq!(results[1], Err(GitError::RepositoryUnreadable));
    assert_eq!(results[2], Err(GitError::RepositoryUnreadable));
    assert_eq!(results[3], Ok(String::new()));
}

/// A FIFO swapped in after the look must not hold the open up: the open
/// doesn't wait for a writer, and the opened file is then refused.
#[cfg(unix)]
#[test]
#[allow(
    clippy::disallowed_methods,
    reason = "a test's programs share its console"
)]
fn filter_writes_opens_an_attribute_file_without_waiting_for_a_fifo() {
    let root = std::env::temp_dir().join(format!("git-guard-fifo-open-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("the folder is created");
    let fifo = root.join("attributes");
    let made = std::process::Command::new("mkfifo")
        .arg(&fifo)
        .status()
        .expect("mkfifo runs");
    assert!(made.success());
    let (sender, receiver) = std::sync::mpsc::channel();
    let opening = fifo.clone();
    std::thread::spawn(move || {
        let opened = open_without_waiting(&opening)
            .map(|file| file.metadata().is_ok_and(|metadata| metadata.is_file()));
        let _ = sender.send(opened.ok());
    });
    let opened = receiver.recv_timeout(std::time::Duration::from_secs(30));
    std::fs::remove_dir_all(&root).expect("the folder is removed");
    assert_eq!(opened, Ok(Some(false)), "the open waited, or failed");
}
