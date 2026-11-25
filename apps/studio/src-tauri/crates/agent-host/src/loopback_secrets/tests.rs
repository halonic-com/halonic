//! A stand-in host in the test's own threads writes requests to the shell's
//! end of the channel and reads the answers, over pipes, as the host does on
//! its standard output and input after the handshake.

use std::io::{self, PipeReader, PipeWriter, Read, Write};
use std::sync::Arc;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

use halonic_secrets::{MemoryBackend, SecretBackend, SecretName};
use serde_json::{Value, json};

use super::LoopbackSecrets;
use crate::held_backend::Held;
use crate::relay::{DATA, frame};

/// Long enough for a thread to run on a busy CI machine.
const WAIT: Duration = Duration::from_secs(20);

const VALUE: &str = "a-test-value-not-a-key";

const END: u8 = 3;

/// The host's side: the frames the shell wrote to its input, and its output.
struct StandIn {
    frames: Receiver<(u32, u8, Vec<u8>)>,
    output: Option<PipeWriter>,
}

impl StandIn {
    fn send(&mut self, id: u32, kind: u8, bytes: &[u8]) {
        let output = self.output.as_mut().expect("the output is open");
        output
            .write_all(&frame(id, kind, bytes))
            .expect("write a frame");
    }

    fn request(&mut self, request: &Value) {
        self.send(0, DATA, request.to_string().as_bytes());
    }

    fn answer(&self) -> Value {
        let (id, kind, bytes) = self.frames.recv_timeout(WAIT).expect("an answer");
        assert_eq!((id, kind), (0, DATA));
        serde_json::from_slice(&bytes).expect("the answer is JSON")
    }

    /// True once the shell closed the host's input, having written nothing more.
    fn input_closed(&self) -> bool {
        match self.frames.recv_timeout(WAIT) {
            Err(RecvTimeoutError::Disconnected) => true,
            Ok(_) | Err(RecvTimeoutError::Timeout) => false,
        }
    }
}

fn serve(backend: Arc<dyn SecretBackend>) -> (LoopbackSecrets, StandIn) {
    let (mut input, shell_input) = io::pipe().expect("a pipe");
    let (shell_output, output) = io::pipe().expect("a pipe");
    let secrets = LoopbackSecrets::serve(shell_input, shell_output, backend);
    let (sender, frames) = mpsc::channel();
    std::thread::spawn(move || {
        while let Some(frame) = read_frame(&mut input) {
            if sender.send(frame).is_err() {
                return;
            }
        }
    });
    let stand_in = StandIn {
        frames,
        output: Some(output),
    };
    (secrets, stand_in)
}

fn read_frame(input: &mut PipeReader) -> Option<(u32, u8, Vec<u8>)> {
    let mut header = [0_u8; 9];
    input.read_exact(&mut header).ok()?;
    let id = u32::from_be_bytes([header[0], header[1], header[2], header[3]]);
    let length = u32::from_be_bytes([header[5], header[6], header[7], header[8]]);
    let mut bytes = vec![0_u8; length as usize];
    input.read_exact(&mut bytes).expect("a whole frame");
    Some((id, header[4], bytes))
}

/// Waits until `done` holds, for state the test can't wait on otherwise.
fn wait_until(mut done: impl FnMut() -> bool) {
    let deadline = Instant::now() + WAIT;
    while !done() {
        assert!(Instant::now() < deadline, "waited too long");
        std::thread::sleep(Duration::from_millis(5));
    }
}

#[test]
fn host_secrets_channel_on_loopback_answers_on_id_0() {
    let (secrets, mut host) = serve(Arc::new(MemoryBackend::new()));

    host.request(&json!({ "op": "set", "name": "remote_host_key", "value": VALUE }));
    assert_eq!(host.answer(), json!({ "ok": true, "value": null }));
    host.request(&json!({ "op": "get", "name": "remote_host_key" }));
    assert_eq!(host.answer(), json!({ "ok": true, "value": VALUE }));
    host.request(&json!({ "op": "delete", "name": "remote_host_key" }));
    assert_eq!(host.answer(), json!({ "ok": true, "value": null }));
    host.request(&json!({ "op": "get", "name": "remote_host_key" }));
    assert_eq!(host.answer(), json!({ "ok": true, "value": null }));

    assert!(!secrets.is_stopped());
}

#[test]
fn host_secrets_channel_on_loopback_closes_the_input_on_a_name_the_host_may_not_reach() {
    let backend = Arc::new(MemoryBackend::new());
    let page_only = SecretName::parse("serve_password").expect("a valid name");
    backend.set(&page_only, VALUE).expect("seed");
    let (secrets, mut host) = serve(backend);

    host.request(&json!({ "op": "get", "name": "serve_password" }));

    assert!(
        host.input_closed(),
        "no answer, and the host's input closes"
    );
    assert!(secrets.is_stopped());
}

#[test]
fn host_secrets_channel_on_loopback_closes_the_input_on_a_malformed_request() {
    let (secrets, mut host) = serve(Arc::new(MemoryBackend::new()));

    host.send(0, DATA, b"not a request");

    assert!(host.input_closed());
    assert!(secrets.is_stopped());
}

#[test]
fn host_secrets_channel_on_loopback_closes_the_input_on_any_other_frame() {
    // A frame on another id: on loopback no connection is ever opened.
    let (secrets, mut host) = serve(Arc::new(MemoryBackend::new()));
    host.send(1, DATA, b"{}");
    assert!(host.input_closed(), "a frame on id 1");
    assert!(secrets.is_stopped());

    // A frame of another kind on id 0.
    let (secrets, mut host) = serve(Arc::new(MemoryBackend::new()));
    host.send(0, END, &[]);
    assert!(host.input_closed(), "an end on id 0");
    assert!(secrets.is_stopped());
}

#[test]
fn host_secrets_channel_on_loopback_takes_one_request_at_a_time() {
    let (backend, release) = Held::with_release();
    let (secrets, mut host) = serve(backend);
    let get = json!({ "op": "get", "name": "remote_host_key" });
    host.request(&get);
    host.request(&get);

    // It stops on the second request while the first still waits for the
    // keychain; letting that one finish then answers nothing.
    wait_until(|| secrets.is_stopped());
    release.send(()).expect("release the first request");
    assert!(host.input_closed());
}

#[test]
fn host_secrets_channel_on_loopback_closes_the_input_when_the_output_ends() {
    let (secrets, mut host) = serve(Arc::new(MemoryBackend::new()));

    drop(host.output.take());

    assert!(host.input_closed());
    assert!(secrets.is_stopped());
}

#[test]
fn lifetime_stopping_the_loopback_channel_closes_the_host_input() {
    let (secrets, host) = serve(Arc::new(MemoryBackend::new()));

    secrets.stop();

    assert!(host.input_closed());
    assert!(secrets.is_stopped());
}

#[test]
fn opened_workspaces_notice_reaches_the_host_and_answers_still_follow() {
    let (secrets, mut host) = serve(Arc::new(MemoryBackend::new()));
    let notice = json!({ "op": "open_workspace", "folder": "/work/acme" });

    assert!(secrets.notify(notice.to_string().into_bytes()));
    assert_eq!(host.answer(), notice);
    host.request(&json!({ "op": "get", "name": "remote_host_key" }));
    assert_eq!(host.answer(), json!({ "ok": true, "value": null }));

    assert!(!secrets.is_stopped());
}

#[test]
fn opened_workspaces_notice_isnt_sent_once_the_channel_stopped() {
    let (secrets, host) = serve(Arc::new(MemoryBackend::new()));
    secrets.stop();

    assert!(!secrets.notify(b"{}".to_vec()));
    assert!(host.input_closed());
}
