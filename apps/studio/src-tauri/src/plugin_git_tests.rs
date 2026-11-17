//! Requirement `plugin-git-export`: the exports of a session, whatever the
//! page does with their tokens. The export itself is tested in
//! `halonic-git-guard`.

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use super::{Ended, Kept, MAX_EXPORTS, PluginGitExports, refusal, sweep};
use halonic_git_guard::GitError;

/// A folder of its own for one test, removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder = std::env::temp_dir().join(format!("plugin-git-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the scratch folder");
        Self(std::fs::canonicalize(folder).expect("the real path"))
    }

    /// A finished export's folder with a file in it.
    fn work(&self, name: &str) -> Kept {
        let work = self.0.join(name);
        std::fs::create_dir_all(work.join("files")).expect("the folder");
        std::fs::write(work.join("files/plugin.yaml"), "name: weather\n").expect("the file");
        Kept {
            location: format!("location-of-{name}"),
            work,
        }
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn kind(result: Result<impl std::fmt::Debug, super::InstallRefusal>) -> &'static str {
    result.expect_err("the call is refused").kind()
}

#[test]
fn plugin_git_export_takes_only_a_plain_token_that_is_not_in_use() {
    let scratch = Scratch::new("tokens");
    let exports = PluginGitExports::default();
    for token in ["", "a b", "../x", "x/y", "a".repeat(65).as_str()] {
        assert_eq!(
            kind(exports.begin(token, &scratch.0)),
            "export_token_invalid"
        );
    }
    exports
        .begin("dialog-1", &scratch.0)
        .expect("a plain token");
    assert_eq!(
        kind(exports.begin("dialog-1", &scratch.0)),
        "export_token_invalid"
    );
}

#[test]
fn plugin_git_export_keeps_at_most_a_few_exports_at_once() {
    let scratch = Scratch::new("busy");
    let exports = PluginGitExports::default();
    for index in 0..MAX_EXPORTS {
        exports
            .begin(&format!("dialog-{index}"), &scratch.0)
            .expect("room for it");
    }
    assert_eq!(kind(exports.begin("one-more", &scratch.0)), "export_busy");
    exports.failed("dialog-0");
    exports.begin("one-more", &scratch.0).expect("room again");
}

#[test]
fn plugin_git_export_ending_a_running_export_stops_it() {
    let scratch = Scratch::new("stop");
    let exports = PluginGitExports::default();
    let cancel = exports.begin("dialog-1", &scratch.0).expect("begins");
    assert_eq!(exports.end("dialog-1"), Ended::Stopped);
    assert!(cancel.load(Ordering::SeqCst), "git was not told to stop");
}

#[test]
fn plugin_git_export_removes_the_folder_of_an_export_that_finished_after_it_was_ended() {
    let scratch = Scratch::new("late");
    let exports = PluginGitExports::default();
    exports.begin("dialog-1", &scratch.0).expect("begins");
    assert_eq!(exports.end("dialog-1"), Ended::Stopped);
    let kept = scratch.work("late-work");
    let work = kept.work.clone();
    assert!(!exports.finish("dialog-1", kept), "the export was kept");
    assert!(!work.exists(), "the folder was left");
    // The token is free again.
    exports
        .begin("dialog-1", &scratch.0)
        .expect("the token is free");
}

#[test]
fn plugin_git_export_ending_a_finished_export_removes_its_folder() {
    let scratch = Scratch::new("remove");
    let exports = PluginGitExports::default();
    exports.begin("dialog-1", &scratch.0).expect("begins");
    let kept = scratch.work("work-1");
    let work = kept.work.clone();
    assert!(exports.finish("dialog-1", kept));
    assert!(work.join("files/plugin.yaml").exists());
    assert_eq!(
        exports.end("dialog-1"),
        Ended::Removed("location-of-work-1".to_owned())
    );
    assert!(!work.exists(), "the folder was left");
    assert_eq!(exports.end("dialog-1"), Ended::Nothing);
}

#[test]
fn plugin_git_export_ending_an_unknown_token_does_nothing() {
    let exports = PluginGitExports::default();
    assert_eq!(exports.end("never-begun"), Ended::Nothing);
}

#[test]
fn plugin_git_export_removes_what_an_earlier_run_left_before_the_first_export() {
    let scratch = Scratch::new("sweep");
    let left = scratch.work("left-over");
    let exports = PluginGitExports::default();
    exports.begin("dialog-1", &scratch.0).expect("begins");
    assert!(!left.work.exists(), "the leftover stayed");
    // A second export must not remove the first one's folder.
    let kept = scratch.work("work-2");
    let work = kept.work.clone();
    assert!(exports.finish("dialog-1", kept));
    exports.begin("dialog-2", &scratch.0).expect("begins");
    assert!(work.exists(), "a kept export's folder was swept");
}

#[test]
fn plugin_git_export_sweeping_a_missing_folder_is_fine() {
    sweep(Path::new("no-such-folder-of-the-shell"));
}

#[test]
fn plugin_git_export_refuses_with_the_kind_git_gave() {
    let refused = refusal(&GitError::ExportTooLarge);
    assert_eq!(refused.kind(), "export_too_large");
    assert_eq!(refusal(&GitError::Cancelled).kind(), "cancelled");
}
