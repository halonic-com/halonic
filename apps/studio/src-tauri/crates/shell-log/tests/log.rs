//! The shell's log, on a file in a scratch folder. Requirement `shell-log`.

use std::fs;
use std::path::PathBuf;
use std::time::{Duration, UNIX_EPOCH};

use halonic_shell_log::{MAX_LINE_BYTES, ShellLog, log_line, set_aside};

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

#[test]
fn shell_log_writes_one_line_per_record_with_its_time_and_source() {
    let at = UNIX_EPOCH + Duration::from_secs(1_795_000_000);
    assert_eq!(
        log_line(at, "engine_lock", "renewing the lock: denied"),
        "2026-11-18T11:06:40Z engine_lock: renewing the lock: denied\n"
    );
    assert_eq!(
        log_line(UNIX_EPOCH, "agent host", "first\r\nsecond"),
        "1970-01-01T00:00:00Z agent host: first  second\n"
    );
}

#[test]
fn shell_log_cuts_a_message_too_long_for_one_line() {
    let line = log_line(UNIX_EPOCH, "agent host", &"é".repeat(MAX_LINE_BYTES));
    assert!(line.ends_with(" (cut)\n"), "{line}");
    assert!(line.len() < MAX_LINE_BYTES + 64, "{}", line.len());
}

#[test]
fn shell_log_appends_to_a_file_in_a_folder_it_makes() {
    let scratch = Scratch::new("append");
    let log = ShellLog::new(scratch.file());
    log.append("one\n").expect("the log can be written");
    log.append("two\n").expect("the log can be written");
    assert_eq!(
        fs::read_to_string(scratch.file()).expect("the log"),
        "one\ntwo\n"
    );
}

#[test]
fn shell_log_sets_a_full_file_aside_once_and_starts_a_new_one() {
    let scratch = Scratch::new("cap");
    let log = ShellLog::with_max_bytes(scratch.file(), 10);
    log.append("12345678\n").expect("the log can be written");
    log.append("abcdefgh\n").expect("the log can be written");
    log.append("ABCDEFGH\n").expect("the log can be written");
    assert_eq!(
        fs::read_to_string(scratch.file()).expect("the log"),
        "ABCDEFGH\n"
    );
    assert_eq!(
        fs::read_to_string(set_aside(&scratch.file())).expect("the older log"),
        "abcdefgh\n"
    );
}
