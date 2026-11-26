//! The lines recorded before the shell's log starts, on a file in a scratch
//! folder. Requirement `shell-log-before-start`.
//!
//! A test binary of its own, so its log starts here and nowhere else.

use std::fs;
use std::path::PathBuf;

use halonic_shell_log::{HeldLines, MAX_HELD_LINES, record, start};

/// A folder of its own for one test, under the system's temporary folder,
/// removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let root = std::env::temp_dir().join(format!("shell-log-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&root);
        Self(root)
    }

    fn file(&self) -> PathBuf {
        self.0.join("studio").join("shell.log")
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

// The only test that starts the shared log, which a test binary can start once.
#[test]
fn shell_log_before_start_writes_the_held_lines_first_when_it_starts() {
    let scratch = Scratch::new("before-start");
    record("quick-ask", "the saved keys can't be read: Unreadable");
    record("feedback", "the saved shortcut can't be read: Unreadable");
    for number in 2..MAX_HELD_LINES + 3 {
        record("acme", format!("line {number}"));
    }
    assert!(!scratch.file().exists());
    start(scratch.file());
    record(
        "quick-ask",
        "the keys Control+Alt+Space aren't registered: taken",
    );
    let log = fs::read_to_string(scratch.file()).expect("the log");
    // Each line without its time.
    let lines: Vec<&str> = log
        .lines()
        .map(|line| line.split_once(' ').map_or(line, |(_, rest)| rest))
        .collect();
    assert_eq!(lines.len(), MAX_HELD_LINES + 2, "{log}");
    assert_eq!(
        lines[..2],
        [
            "quick-ask: the saved keys can't be read: Unreadable",
            "feedback: the saved shortcut can't be read: Unreadable",
        ]
    );
    assert_eq!(
        lines[MAX_HELD_LINES - 1..],
        [
            format!("acme: line {}", MAX_HELD_LINES - 1).as_str(),
            "shell log: 3 more lines recorded before the log started were left out",
            "quick-ask: the keys Control+Alt+Space aren't registered: taken",
        ]
    );
}

#[test]
fn shell_log_before_start_holds_the_first_lines_and_counts_the_rest() {
    let mut held = HeldLines::new();
    for number in 0..MAX_HELD_LINES + 3 {
        held.hold(format!("line {number}\n"));
    }
    let (lines, left_out) = held.take();
    assert_eq!(lines.len(), MAX_HELD_LINES);
    assert_eq!(lines.first().map(String::as_str), Some("line 0\n"));
    assert_eq!(left_out, 3);
    assert_eq!(held.take(), (Vec::new(), 0));
}
