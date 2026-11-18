//! The shell's log, on a file in a scratch folder. Requirement `shell-log`.

use std::fs;
use std::path::PathBuf;
use std::time::{Duration, UNIX_EPOCH};

use halonic_shell_log::{
    MAX_LINE_BYTES, ShellLog, find_key_shape, log_line, record_printed, set_aside, start,
};

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

#[cfg(unix)]
#[test]
fn shell_log_files_are_readable_by_their_owner_only() {
    use std::os::unix::fs::PermissionsExt;

    let scratch = Scratch::new("mode");
    let log = ShellLog::with_max_bytes(scratch.file(), 10);
    log.append("12345678\n").expect("the log can be written");
    log.append("abcdefgh\n").expect("the log can be written");
    for file in [scratch.file(), set_aside(&scratch.file())] {
        let mode = fs::metadata(&file).expect("the log").permissions().mode();
        assert_eq!(mode & 0o777, 0o600, "{}", file.display());
    }
}

#[test]
fn shell_log_spots_the_key_shapes_studio_holds_back() {
    let body = "Ab3".repeat(6);
    for (text, kind) in [
        (format!("Error: 401 for sk-ant-{body}"), "ai-provider-key"),
        (
            format!("client_secret=GOCSPX-{body}"),
            "google-client-secret",
        ),
        (format!("key AIza{body} rejected"), "google-api-key"),
        (format!("ghp_{body}"), "github-token"),
        (format!("token github_pat_{body}"), "github-token"),
        (format!("xoxb-{body}"), "slack-token"),
    ] {
        assert_eq!(find_key_shape(&text), Some(kind), "{text}");
    }
}

#[test]
fn shell_log_keeps_text_that_only_looks_like_a_key_prefix() {
    for text in [
        "we use sk-learn for this",
        "sk-learn-tutorial-for-beginners",
        &format!("task-{}", "Ab3".repeat(6)),
        &format!("xGOCSPX-{}", "Ab3".repeat(6)),
        "sk-Ab3Ab3Ab3Ab3Ab3",
        "the run in notes/acme failed: denied",
    ] {
        assert_eq!(find_key_shape(text), None, "{text}");
    }
}

// The only test that starts the shared log, which a test binary can start once.
#[test]
fn shell_log_leaves_out_a_printed_line_shaped_like_a_key() {
    let scratch = Scratch::new("printed");
    start(scratch.file());
    let key = format!("sk-ant-{}", "Ab3".repeat(6));
    record_printed("agent host", &format!("Error: 401 for {key}"));
    record_printed("agent host", "listening on loopback");
    let log = fs::read_to_string(scratch.file()).expect("the log");
    assert!(!log.contains(&key), "{log}");
    assert!(
        log.contains(
            "agent host: (a line was left out: it held text shaped like a key (ai-provider-key))"
        ),
        "{log}"
    );
    assert!(log.contains("agent host: listening on loopback"), "{log}");
}
