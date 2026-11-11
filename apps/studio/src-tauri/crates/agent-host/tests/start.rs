//! Starts stand-in hosts: small scripts that print a line and then wait for
//! their input to close, or ignore it, as the real host would or wouldn't.

use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

use halonic_agent_host::{
    AgentHost, AgentHostError, EXECUTABLE_NAME, Stopped, executable_beside, host_command,
};

/// A made-up token of the right form, 43 base64url characters.
const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234";
const HANDSHAKE: &str =
    r#"{"url":"http://127.0.0.1:49152","token":"abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234"}"#;

/// Long enough for a script to start on a busy CI machine.
const WAIT: Duration = Duration::from_secs(20);

/// What a stand-in host does after it starts.
enum Script {
    /// Prints `line`, then waits until its input closes, as the host does.
    PrintThenWaitForInput(&'static str),
    /// Prints `line`, then runs on whatever happens to its input.
    PrintThenIgnoreInput(&'static str),
    /// Prints nothing and runs on.
    Silent,
    /// Exits at once.
    Exit,
}

static NEXT_SCRIPT: AtomicU32 = AtomicU32::new(0);

/// Writes the script into a fresh file of the system's temporary folder.
fn stand_in(script: &Script) -> Command {
    let number = NEXT_SCRIPT.fetch_add(1, Ordering::Relaxed);
    let name = format!("halonic-agent-host-test-{}-{number}", std::process::id());
    write_script(std::env::temp_dir().join(name), script)
}

/// Runs through `sh` rather than as a program of its own: executing a file
/// just written can fail with "text file busy" while another test thread
/// starts a process.
#[cfg(unix)]
fn write_script(base: PathBuf, script: &Script) -> Command {
    let body = match script {
        Script::PrintThenWaitForInput(line) => format!("printf '%s\\n' '{line}'\ncat > /dev/null"),
        Script::PrintThenIgnoreInput(line) => format!("printf '%s\\n' '{line}'\nexec sleep 60"),
        Script::Silent => "exec sleep 60".to_owned(),
        Script::Exit => "exit 3".to_owned(),
    };
    let path = base.with_extension("sh");
    std::fs::write(&path, format!("{body}\n")).expect("write the script");
    let mut command = Command::new("/bin/sh");
    command.arg(path);
    command
}

#[cfg(windows)]
fn write_script(base: PathBuf, script: &Script) -> Command {
    // `findstr` reads its input until it closes; `ping` waits without reading it.
    let body = match script {
        Script::PrintThenWaitForInput(line) => format!("echo {line}\r\nfindstr \"^\" >nul"),
        Script::PrintThenIgnoreInput(line) => format!("echo {line}\r\nping -n 60 127.0.0.1 >nul"),
        Script::Silent => "ping -n 60 127.0.0.1 >nul".to_owned(),
        Script::Exit => "exit /b 3".to_owned(),
    };
    let path = base.with_extension("cmd");
    std::fs::write(&path, format!("@echo off\r\n{body}\r\n")).expect("write the script");
    Command::new(path)
}

#[test]
fn lifetime_reads_the_handshake_of_a_started_host() {
    let host = AgentHost::start(stand_in(&Script::PrintThenWaitForInput(HANDSHAKE)), WAIT)
        .expect("the stand-in serves");
    assert_eq!(host.handshake().url(), "http://127.0.0.1:49152");
    assert_eq!(host.handshake().token(), TOKEN);
    assert!(!format!("{host:?}").contains(TOKEN));
}

#[test]
fn lifetime_host_stops_when_its_input_closes() {
    let host = AgentHost::start(stand_in(&Script::PrintThenWaitForInput(HANDSHAKE)), WAIT)
        .expect("the stand-in serves");
    assert_eq!(host.stop(WAIT), Stopped::Exited);
}

#[test]
fn lifetime_host_that_runs_on_is_killed_after_the_grace_period() {
    let host = AgentHost::start(stand_in(&Script::PrintThenIgnoreInput(HANDSHAKE)), WAIT)
        .expect("the stand-in serves");
    let started = Instant::now();
    assert_eq!(host.stop(Duration::from_millis(200)), Stopped::Killed);
    assert!(started.elapsed() < WAIT);
}

#[test]
fn lifetime_host_keeps_running_while_the_shell_holds_it() {
    let mut host = AgentHost::start(stand_in(&Script::PrintThenWaitForInput(HANDSHAKE)), WAIT)
        .expect("the stand-in serves");
    std::thread::sleep(Duration::from_millis(300));
    assert!(!host.has_exited());
}

#[test]
fn lifetime_refuses_a_host_that_prints_nothing_in_time() {
    let wait = Duration::from_millis(300);
    let error = AgentHost::start(stand_in(&Script::Silent), wait).expect_err("no handshake");
    assert_eq!(error, AgentHostError::TimedOut(wait));
}

#[test]
fn lifetime_refuses_a_host_that_exits_before_it_serves() {
    let error = AgentHost::start(stand_in(&Script::Exit), WAIT).expect_err("no handshake");
    assert_eq!(error, AgentHostError::Exited);
}

#[test]
fn lifetime_refuses_a_host_whose_line_isnt_a_handshake() {
    let line =
        r#"{"url":"http://example.com:80","token":"abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234"}"#;
    let error = AgentHost::start(stand_in(&Script::PrintThenWaitForInput(line)), WAIT)
        .expect_err("refused");
    let message = error.to_string();
    assert!(
        message.contains("isn't http://127.0.0.1:<port>"),
        "{message}"
    );
    assert!(!message.contains(TOKEN));
}

#[test]
fn lifetime_says_why_a_host_can_not_start() {
    let missing = std::env::temp_dir().join("halonic-agent-host-test-missing-program");
    let error = AgentHost::start(Command::new(missing), WAIT).expect_err("can't start");
    assert!(matches!(error, AgentHostError::Start(_)), "{error:?}");
}

#[test]
fn lifetime_finds_the_executable_next_to_the_app_and_passes_the_profile() {
    let app = std::env::temp_dir().join("Halonic").join("halonic-studio");
    let executable = executable_beside(&app).expect("has a folder");
    let expected = format!("{EXECUTABLE_NAME}{}", std::env::consts::EXE_SUFFIX);
    assert_eq!(
        executable,
        std::env::temp_dir().join("Halonic").join(expected)
    );

    let profile = std::env::temp_dir().join("profile");
    let command = host_command(&executable, &profile);
    let args: Vec<_> = command.get_args().collect();
    assert_eq!(
        args,
        [
            std::ffi::OsStr::new("--profile-folder"),
            profile.as_os_str()
        ]
    );
}
