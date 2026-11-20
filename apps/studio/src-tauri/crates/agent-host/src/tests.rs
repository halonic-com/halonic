//! The handshake readers and the relay's part in `has_exited`.

use std::io::Cursor;
use std::process::{Command, Stdio};
use std::time::Duration;

use super::handshake::read_relayed_handshake;
use super::relay::Relay;
use super::{AgentHost, FirstLine, read_first_line};

const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234";

fn first_line_of(output: &[u8]) -> FirstLine {
    read_first_line(Cursor::new(output.to_vec()))
        .recv()
        .expect("the reader answers")
}

#[test]
fn handshake_first_line_is_read_up_to_its_newline() {
    assert_eq!(
        first_line_of(b"{}\nmore\n"),
        FirstLine::Text("{}\n".to_owned())
    );
}

#[test]
fn handshake_first_line_that_isnt_utf8_is_told_apart_from_an_ended_output() {
    assert_eq!(first_line_of(b"\xff\xfe\n"), FirstLine::NotText);
    assert_eq!(first_line_of(b""), FirstLine::Ended);
}

#[test]
fn relay_handshake_is_the_token_with_the_relays_address() {
    let line = format!("{{\"token\":\"{TOKEN}\"}}\r\n");
    let handshake = read_relayed_handshake(line.as_bytes(), 49152)
        .expect("a handshake")
        .expect("not skipped");
    assert_eq!(handshake.url(), "http://127.0.0.1:49152");
    assert_eq!(handshake.token(), TOKEN);
}

#[test]
fn relay_handshake_skips_wsl_messages_but_not_after_a_utf16_newline() {
    // "Hi" and a newline in UTF-16, as wsl.exe prints them.
    assert_eq!(read_relayed_handshake(b"H\0i\0\r\0\n", 1), Ok(None));
    assert_eq!(read_relayed_handshake(b"\xff\xfe\n", 1), Ok(None));
    assert_eq!(read_relayed_handshake(b"[1,2]\n", 1), Ok(None));
    // The NUL a UTF-16 newline leaves before the host's own line.
    let line = format!("\0{{\"token\":\"{TOKEN}\"}}\n");
    assert!(matches!(
        read_relayed_handshake(line.as_bytes(), 1),
        Ok(Some(_))
    ));
}

#[test]
fn relay_handshake_refuses_an_object_that_isnt_a_token_without_repeating_it() {
    let with_url = format!("{{\"url\":\"http://127.0.0.1:1\",\"token\":\"{TOKEN}\"}}\n");
    for line in [with_url.as_str(), "{\"token\":\"short\"}\n", "{}\n"] {
        let error = read_relayed_handshake(line.as_bytes(), 1).expect_err(line);
        assert!(!error.to_string().contains(TOKEN), "{error}");
    }
}

#[test]
fn relay_stopped_counts_as_an_exited_host() {
    // Runs until its input closes, so only the relay's state tells.
    #[cfg(unix)]
    let mut command = {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "cat > /dev/null"]);
        command
    };
    #[cfg(windows)]
    let mut command = {
        let mut command = Command::new("findstr");
        command.arg("^");
        command
    };
    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .expect("start the stand-in");
    let mut relay = Relay::bind().expect("bind the relay");
    let (_input, relay_input) = std::io::pipe().expect("a pipe");
    let (relay_output, _output) = std::io::pipe().expect("a pipe");
    relay.serve(relay_input, relay_output, TOKEN);
    let line = format!("{{\"token\":\"{TOKEN}\"}}\n");
    let handshake = read_relayed_handshake(line.as_bytes(), relay.port())
        .expect("a handshake")
        .expect("not skipped");
    let mut host = AgentHost {
        child,
        stdin: None,
        relay: Some(relay),
        handshake,
    };

    assert!(!host.has_exited(), "the relay serves and the host runs");
    host.relay.as_ref().expect("the relay").stop();
    assert!(host.has_exited(), "a stopped relay reaches no host");
    host.stop(Duration::from_secs(5));
}
