use super::{named_filter, passes_content, target_revisions};
use crate::check_args::{CheckedCall, check_args};

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
    assert_eq!(
        target_revisions(&call("pull --ff-only origin main")),
        ["@{upstream}"]
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
