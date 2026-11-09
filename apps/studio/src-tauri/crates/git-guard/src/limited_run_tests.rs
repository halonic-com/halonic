use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use super::run_limited;
use crate::error::GitError;
use crate::find_git::find_git;

fn git() -> Command {
    let path = std::env::var_os("PATH").unwrap_or_default();
    Command::new(find_git(&path).expect("the tests need git on the PATH"))
}

fn in_ms(milliseconds: u64) -> Instant {
    Instant::now() + Duration::from_millis(milliseconds)
}

#[test]
fn git_process_finds_git_only_in_absolute_folders() {
    let path = std::env::var_os("PATH").unwrap_or_default();
    let git = find_git(&path).expect("the tests need git on the PATH");
    assert!(git.is_absolute());
    let relative_only = std::env::join_paths([".", "bin"]).expect("a valid PATH");
    assert!(find_git(&relative_only).is_err());
}

#[test]
fn git_process_stops_git_at_the_deadline() {
    // hash-object waits for stdin, which stays open, so git never ends on
    // its own.
    let mut command = git();
    command
        .args(["hash-object", "--stdin"])
        .stdin(Stdio::piped());
    let result = run_limited(&mut command, in_ms(200), 1024);
    assert_eq!(result, Err(GitError::TimedOut));
}

#[test]
fn git_process_fails_over_the_output_limit() {
    let mut command = git();
    command.arg("--version");
    let result = run_limited(&mut command, in_ms(30_000), 4);
    assert_eq!(result, Err(GitError::OutputTooLarge));
}

#[test]
fn git_process_returns_the_full_output_within_the_limits() {
    let mut command = git();
    command.arg("--version");
    let output = run_limited(&mut command, in_ms(30_000), 1024).expect("git runs");
    assert_eq!(output.code, Some(0));
    assert!(output.stdout.starts_with(b"git version "));
}

/// Whether the process whose id a test's shell wrote to `pid_file` still
/// runs. A stopped process stays a zombie until its new parent waits for
/// it, so on Linux its state is read; elsewhere it is given time to go.
#[cfg(unix)]
fn is_running(pid_file: &std::path::Path) -> bool {
    let pid = std::fs::read_to_string(pid_file).expect("the shell wrote the id");
    let pid = pid.trim();
    for _ in 0..50 {
        let running = match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
            // The state follows the program name in brackets.
            Ok(stat) => !stat
                .rsplit_once(") ")
                .is_some_and(|(_, rest)| rest.starts_with('Z')),
            Err(_) if std::path::Path::new("/proc/self").exists() => false,
            Err(_) => Command::new("/bin/sh")
                .args(["-c", &format!("kill -0 {pid}")])
                .stderr(Stdio::null())
                .status()
                .expect("sh runs")
                .success(),
        };
        if !running {
            return false;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    true
}

#[cfg(unix)]
#[test]
fn git_process_stops_every_program_git_started_at_the_deadline() {
    // The shell stands in for git, and `sleep` for an ssh it started: the
    // sleep holds the output pipes, so stopping only the shell would leave
    // the readers waiting for 30 seconds.
    let folder = std::env::temp_dir().join(format!("git-guard-group-{}", std::process::id()));
    std::fs::create_dir_all(&folder).expect("the folder is created");
    let pid_file = folder.join("sleep.pid");
    let mut command = Command::new("/bin/sh");
    command.args([
        "-c",
        &format!("sleep 30 & echo $! > '{}'; wait", pid_file.display()),
    ]);
    let started = Instant::now();
    let result = run_limited(&mut command, in_ms(300), 1024);
    assert_eq!(result, Err(GitError::TimedOut));
    assert!(started.elapsed() < Duration::from_secs(10));
    assert!(!is_running(&pid_file), "the program git started is stopped");
    let _ = std::fs::remove_dir_all(&folder);
}

#[cfg(unix)]
#[test]
fn git_process_ends_the_call_at_the_deadline_when_a_program_outlives_git() {
    // The shell exits at once, and the sleep it started keeps the pipes
    // open after it.
    let folder = std::env::temp_dir().join(format!("git-guard-outlives-{}", std::process::id()));
    std::fs::create_dir_all(&folder).expect("the folder is created");
    let pid_file = folder.join("sleep.pid");
    let mut command = Command::new("/bin/sh");
    command.args([
        "-c",
        &format!("sleep 30 & echo $! > '{}'; exit 0", pid_file.display()),
    ]);
    let started = Instant::now();
    let result = run_limited(&mut command, in_ms(300), 1024);
    assert_eq!(result, Err(GitError::TimedOut));
    assert!(started.elapsed() < Duration::from_secs(10));
    let pid = std::fs::read_to_string(&pid_file).expect("the shell wrote the id");
    let _ = Command::new("/bin/sh")
        .args(["-c", &format!("kill {}", pid.trim())])
        .status();
    let _ = std::fs::remove_dir_all(&folder);
}
