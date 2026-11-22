//! Starts stand-in hosts that ask the shell for their own secrets: small
//! scripts that check they were told about the channel (`--keychain-relay`),
//! print their handshake, send one request on id 0 and keep what the shell
//! answers. The channel's rules are tested beside it, in
//! `src/loopback_secrets/tests.rs` and `src/relay/secrets/tests.rs`.

#![cfg(unix)]
#![allow(
    clippy::disallowed_methods,
    reason = "a test's programs share its console"
)]

use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

use halonic_agent_host::{AgentHost, Stopped};
use halonic_secrets::{MemoryBackend, SecretBackend, SecretName};
use serde_json::{Value, json};

const HANDSHAKE: &str =
    r#"{"url":"http://127.0.0.1:49152","token":"abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234"}"#;
const RELAYED_HANDSHAKE: &str = r#"{"token":"abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234"}"#;

/// Long enough for a script to start on a busy CI machine.
const WAIT: Duration = Duration::from_secs(20);

const VALUE: &str = "a-test-value-not-a-key";

/// Exits the stand-in unless the shell told it about the channel.
const TOLD: &str = "case \" $* \" in *' --keychain-relay '*) ;; *) exit 9 ;; esac\n";

/// Exits the stand-in when the shell told it about a channel it doesn't answer.
const NOT_TOLD: &str = "case \" $* \" in *' --keychain-relay '*) exit 9 ;; esac\n";

static NEXT_SCRIPT: AtomicU32 = AtomicU32::new(0);

fn script_path(extension: &str) -> PathBuf {
    let number = NEXT_SCRIPT.fetch_add(1, Ordering::Relaxed);
    let name = format!("halonic-agent-host-secrets-{}-{number}", std::process::id());
    std::env::temp_dir().join(name).with_extension(extension)
}

/// Runs through `sh`: executing a file just written can fail with "text
/// file busy" while another test thread starts a process.
fn shell(body: &str) -> Command {
    let path = script_path("sh");
    std::fs::write(&path, body).expect("write the script");
    let mut command = Command::new("/bin/sh");
    command.arg(path);
    command
}

/// The `printf` that writes `request` as one `data` frame on id 0.
fn printf_request(request: &Value) -> String {
    let payload = request.to_string().into_bytes();
    let length = u32::try_from(payload.len()).expect("a short request");
    let mut frame = vec![0, 0, 0, 0, 2];
    frame.extend_from_slice(&length.to_be_bytes());
    frame.extend_from_slice(&payload);
    let mut escaped = String::new();
    for byte in frame {
        write!(escaped, "\\{byte:03o}").expect("write to a string");
    }
    format!("printf '{escaped}'\n")
}

/// A stand-in that checks `told`, prints `handshake`, asks for its remote
/// host key and keeps what comes back on its input in `received`.
fn asking(told: &str, handshake: &str, received: &Path) -> Command {
    let get = json!({ "op": "get", "name": "remote_host_key" });
    shell(&format!(
        "{told}printf '%s\\n' '{handshake}'\n{}cat > '{}'\n",
        printf_request(&get),
        received.display()
    ))
}

/// The keychain, holding the host's key.
fn keychain() -> Arc<dyn SecretBackend> {
    let backend = MemoryBackend::new();
    let name = SecretName::parse("remote_host_key").expect("a valid name");
    backend.set(&name, VALUE).expect("seed");
    Arc::new(backend)
}

/// The first frame in `received` once it is whole: its id, kind and JSON.
fn first_answer(received: &Path) -> (u32, u8, Value) {
    let deadline = Instant::now() + WAIT;
    loop {
        let bytes = std::fs::read(received).unwrap_or_default();
        if bytes.len() >= 9 {
            let length = u32::from_be_bytes([bytes[5], bytes[6], bytes[7], bytes[8]]) as usize;
            if bytes.len() >= 9 + length {
                let id = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
                let answer = serde_json::from_slice(&bytes[9..9 + length]).expect("JSON");
                let _ = std::fs::remove_file(received);
                return (id, bytes[4], answer);
            }
        }
        assert!(Instant::now() < deadline, "no answer in time");
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn host_secrets_channel_answers_a_host_on_loopback_after_its_handshake() {
    let received = script_path("bin");
    let command = asking(TOLD, HANDSHAKE, &received);

    let host = AgentHost::start_answering_secrets(command, WAIT, Some(keychain()))
        .expect("the stand-in serves");

    assert_eq!(host.handshake().url(), "http://127.0.0.1:49152");
    let answer = json!({ "ok": true, "value": VALUE });
    assert_eq!(first_answer(&received), (0, 2, answer));
    assert_eq!(host.stop(WAIT), Stopped::Exited);
}

#[test]
fn host_secrets_channel_answers_a_host_behind_the_relay() {
    let received = script_path("bin");
    let command = asking(TOLD, RELAYED_HANDSHAKE, &received);

    let host = AgentHost::start_relayed_answering_secrets(|_| command, WAIT, Some(keychain()))
        .expect("the stand-in serves");

    let answer = json!({ "ok": true, "value": VALUE });
    assert_eq!(first_answer(&received), (0, 2, answer));
    assert_eq!(host.stop(WAIT), Stopped::Exited);
}

#[test]
fn host_secrets_channel_isnt_named_to_a_host_the_shell_doesnt_answer() {
    let local = shell(&format!(
        "{NOT_TOLD}printf '%s\\n' '{HANDSHAKE}'\ncat > /dev/null\n"
    ));
    let host = AgentHost::start(local, WAIT).expect("started without --keychain-relay");
    assert_eq!(host.stop(WAIT), Stopped::Exited);

    let body = format!("{NOT_TOLD}printf '%s\\n' '{RELAYED_HANDSHAKE}'\ncat > /dev/null\n");
    let host =
        AgentHost::start_relayed(|_| shell(&body), WAIT).expect("started without --keychain-relay");
    assert_eq!(host.stop(WAIT), Stopped::Exited);
}
