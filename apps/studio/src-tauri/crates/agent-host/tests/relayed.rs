//! Starts stand-in hosts that serve over their standard input and output:
//! small scripts that print what `wsl.exe` and the host would, then wait
//! for their input to close. The frames themselves are tested beside the
//! relay, in `src/relay/tests.rs`.

use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

use halonic_agent_host::{AgentHost, AgentHostError, Stopped};

/// A made-up token of the right form, 43 base64url characters.
const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234";
const HANDSHAKE: &str = r#"{"token":"abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234"}"#;

/// Long enough for a script to start on a busy CI machine.
const WAIT: Duration = Duration::from_secs(20);

static NEXT_SCRIPT: AtomicU32 = AtomicU32::new(0);

fn script_path(extension: &str) -> PathBuf {
    let number = NEXT_SCRIPT.fetch_add(1, Ordering::Relaxed);
    let name = format!("halonic-agent-host-relayed-{}-{number}", std::process::id());
    std::env::temp_dir().join(name).with_extension(extension)
}

/// A stand-in that prints `lines`, then waits until its input closes.
#[cfg(unix)]
fn printing(lines: &[&str]) -> Command {
    let mut body = String::new();
    for line in lines {
        body.push_str(&format!("printf '%s\\n' '{line}'\n"));
    }
    body.push_str("cat > /dev/null\n");
    shell(&body)
}

#[cfg(windows)]
fn printing(lines: &[&str]) -> Command {
    let mut body = String::from("@echo off\r\n");
    for line in lines {
        body.push_str(&format!("echo {line}\r\n"));
    }
    body.push_str("findstr \"^\" >nul\r\n");
    let path = script_path("cmd");
    std::fs::write(&path, body).expect("write the script");
    Command::new(path)
}

/// A stand-in that prints `line`, then exits.
#[cfg(unix)]
fn exiting(line: &str) -> Command {
    shell(&format!("printf '%s\\n' '{line}'\nexit 3\n"))
}

#[cfg(windows)]
fn exiting(line: &str) -> Command {
    let path = script_path("cmd");
    std::fs::write(&path, format!("@echo off\r\necho {line}\r\nexit /b 3\r\n"))
        .expect("write the script");
    Command::new(path)
}

/// Runs through `sh`: executing a file just written can fail with "text
/// file busy" while another test thread starts a process.
#[cfg(unix)]
fn shell(body: &str) -> Command {
    let path = script_path("sh");
    std::fs::write(&path, body).expect("write the script");
    let mut command = Command::new("/bin/sh");
    command.arg(path);
    command
}

#[test]
fn relay_reads_the_token_and_gives_the_relays_address() {
    let mut port = None;
    let host = AgentHost::start_relayed(
        |relay_port| {
            port = Some(relay_port);
            printing(&["An update for WSL is available.", HANDSHAKE])
        },
        WAIT,
    )
    .expect("the stand-in serves");
    let port = port.expect("the command got the relay's port");
    assert_eq!(host.handshake().url(), format!("http://127.0.0.1:{port}"));
    assert_eq!(host.handshake().token(), TOKEN);
    assert!(!format!("{host:?}").contains(TOKEN));
    assert_eq!(host.stop(WAIT), Stopped::Exited);
}

#[test]
fn relay_refuses_a_json_line_that_isnt_a_token() {
    let line = r#"{"token":"short"}"#;
    let error = AgentHost::start_relayed(|_| printing(&[line]), WAIT).expect_err("refused");
    assert!(matches!(error, AgentHostError::Handshake(_)), "{error:?}");
}

#[test]
fn relay_refuses_a_host_that_ends_before_its_token() {
    let error =
        AgentHost::start_relayed(|_| exiting("no token here"), WAIT).expect_err("no handshake");
    assert_eq!(error, AgentHostError::Exited);
}

#[test]
fn relay_refuses_a_host_that_prints_no_token_in_time() {
    let wait = Duration::from_millis(300);
    let error =
        AgentHost::start_relayed(|_| printing(&["no token here"]), wait).expect_err("no handshake");
    assert_eq!(error, AgentHostError::TimedOut(wait));
}

#[test]
fn relay_says_why_a_host_can_not_start() {
    let missing = std::env::temp_dir().join("halonic-agent-host-test-missing-program");
    let error = AgentHost::start_relayed(|_| Command::new(missing), WAIT).expect_err("can't start");
    assert!(matches!(error, AgentHostError::Start(_)), "{error:?}");
}

/// The first frame a connection to the relay sends reaches the host: `open`
/// for connection 1.
#[cfg(unix)]
#[test]
fn relay_passes_a_connection_to_the_host_as_frames() {
    let received = script_path("bin");
    let body = format!(
        "printf '%s\\n' '{HANDSHAKE}'\nhead -c 9 > '{}'\ncat > /dev/null\n",
        received.display()
    );
    let host = AgentHost::start_relayed(|_| shell(&body), WAIT).expect("the stand-in serves");
    let address = host
        .handshake()
        .url()
        .strip_prefix("http://")
        .expect("an http url")
        .to_owned();
    let _client = std::net::TcpStream::connect(address).expect("the relay accepts");

    let deadline = std::time::Instant::now() + WAIT;
    let mut bytes = Vec::new();
    while bytes.len() < 9 && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
        bytes = std::fs::read(&received).unwrap_or_default();
    }
    let _ = std::fs::remove_file(&received);
    assert_eq!(bytes, [0, 0, 0, 1, 1, 0, 0, 0, 0]);
    assert_eq!(host.stop(WAIT), Stopped::Exited);
}
