//! The phone against the real remote gateway (requirement
//! `gateway-interop`): the host's listener and `SecureSession` from
//! `@halonicjs/adapter-remote-gateway`, running in Node on the gateway
//! tests' fakes, started by `phone-interop-host.test-helper.ts`. Every byte
//! between them is what the two implementations write, over a real
//! WebSocket on loopback.
//!
//! Ignored in plain `cargo test`, because it needs pnpm and the workspace's
//! packages. CI's Rust job has both and runs it with `--ignored`.

#![allow(
    clippy::disallowed_methods,
    reason = "a test's programs share its console"
)]

use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::time::{Duration, Instant};

use halonic_tunnel::{
    Backoff, ConnectionId, Dialer, Endpoint, Opened, PairRefusedReason, PairedComputer, Pairing,
    PairingCheck, PairingCode, PairingRoute, PhoneConnection, PhoneDetails, PhoneEvent, PhoneKeys,
    PhoneOptions, PhoneStatus, Platform, SessionError, Timeouts, Transport, TransportEvent,
};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::mpsc::{self, UnboundedReceiver};
use tokio::time::timeout;

/// The host script, from the repository root.
const HOST_SCRIPT: &str = "packages/adapters/remote-gateway/src/phone-interop-host.test-helper.ts";

/// Node and the gateway's packages take a while to load on a cold runner.
const START_WAIT: Duration = Duration::from_secs(60);

const WAIT: Duration = Duration::from_secs(10);

/// What the host script says first.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Started {
    port: u16,
    host_key: String,
    code: String,
}

/// The real gateway in a Node process, for one test.
struct Host {
    child: Child,
    /// Closing it stops the gateway and the process.
    stdin: Option<ChildStdin>,
    lines: UnboundedReceiver<String>,
    port: u16,
    host_key: [u8; 32],
    code: String,
}

impl Host {
    async fn start() -> Self {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../../..");
        let mut child = Command::new("pnpm")
            .args(["exec", "node", HOST_SCRIPT])
            .current_dir(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("pnpm starts the gateway; run `pnpm install` at the repository root first");
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().expect("the gateway's output");
        let (sender, mut lines) = mpsc::unbounded_channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if sender.send(line).is_err() {
                    break;
                }
            }
        });
        let first = timeout(START_WAIT, lines.recv())
            .await
            .expect("the gateway starts in time")
            .expect("the gateway says where it listens");
        let started: Started = serde_json::from_str(&first).expect("the gateway's first line");
        Self {
            child,
            stdin,
            lines,
            port: started.port,
            host_key: from_hex(&started.host_key),
            code: started.code,
        }
    }

    fn endpoint(&self) -> Endpoint {
        Endpoint::parse(&format!("tcp:127.0.0.1:{}", self.port)).expect("a loopback endpoint")
    }

    fn computer(&self) -> PairedComputer {
        PairedComputer {
            endpoint: self.endpoint(),
            host_key: self.host_key,
        }
    }

    /// The next line the gateway writes, as JSON.
    async fn next_line(&mut self) -> Value {
        let line = timeout(WAIT, self.lines.recv())
            .await
            .expect("a line from the gateway in time")
            .expect("a line from the gateway");
        serde_json::from_str(&line).expect("the gateway writes JSON")
    }

    /// Revokes a paired phone on the host, as the desktop's Remove does.
    fn revoke(&mut self, phone_key: &[u8; 32]) {
        let stdin = self.stdin.as_mut().expect("the gateway runs");
        let command = json!({ "revoke": to_hex(phone_key) });
        writeln!(stdin, "{command}").expect("the gateway reads its input");
    }
}

impl Drop for Host {
    fn drop(&mut self) {
        // The end of its input stops the gateway, and pnpm with it.
        drop(self.stdin.take());
        let _ = self.child.wait();
    }
}

/// A transport to the gateway, with its first connection open.
struct Wire {
    transport: Transport,
    events: UnboundedReceiver<TransportEvent>,
    connection: ConnectionId,
}

impl Wire {
    async fn open(host: &Host) -> Self {
        let (transport, mut events) = Transport::connect(
            host.endpoint(),
            Dialer::without_tls(),
            Backoff::TUNNEL,
            Timeouts::TUNNEL,
        )
        .await
        .expect("the gateway takes the connection");
        let connection = loop {
            if let TransportEvent::Opened(connection) = next(&mut events).await {
                break connection;
            }
        };
        Self {
            transport,
            events,
            connection,
        }
    }

    async fn send(&self, frame: Vec<u8>) {
        self.transport
            .send(self.connection, frame)
            .await
            .expect("the frame goes out");
    }

    /// The next frame from the gateway.
    async fn frame(&mut self) -> Vec<u8> {
        loop {
            if let TransportEvent::Frame(frame) = next(&mut self.events).await {
                return frame;
            }
        }
    }
}

impl Drop for Wire {
    fn drop(&mut self) {
        self.transport.close();
    }
}

async fn next<T>(events: &mut UnboundedReceiver<T>) -> T {
    timeout(WAIT, events.recv())
        .await
        .expect("an event in time")
        .expect("an event")
}

fn pixel() -> PhoneDetails {
    PhoneDetails {
        name: "Pixel".to_owned(),
        platform: Platform::Android,
    }
}

/// The gateway protocol's `hello`, version 2.
fn hello() -> Vec<u8> {
    json!({ "type": "hello", "id": "h1", "version": 2 })
        .to_string()
        .into_bytes()
}

fn message_json(opened: Opened) -> Value {
    match opened {
        Opened::Message(message) => serde_json::from_slice(&message).expect("a JSON message"),
        Opened::Rekeyed => panic!("expected a gateway message, got a rekey"),
    }
}

/// Pairs over `wire` with the gateway's open code, up to and including the
/// host's encrypted `paired`, and checks both screens show one check code.
async fn pair(
    host: &mut Host,
    wire: &mut Wire,
    keys: &PhoneKeys,
    route: PairingRoute,
) -> PairingCheck {
    let code = PairingCode::parse(&host.code).expect("the gateway's code");
    let (pairing, frame1) = Pairing::start(keys, &code, route, &pixel()).expect("message 1");
    wire.send(frame1).await;
    let mut check = pairing
        .read_reply(&wire.frame().await, Instant::now())
        .expect("the host's message 2");
    assert_eq!(check.host_name, "Studio desk");
    assert_eq!(check.host_key, host.host_key);
    wire.send(check.frame3.clone()).await;

    let line = host.next_line().await;
    let decrypted = &line["decrypted"];
    assert_eq!(decrypted["name"], "Pixel");
    assert_eq!(decrypted["platform"], "android");
    assert_eq!(decrypted["checkCode"], check.check_code.as_str());

    let paired = check
        .session
        .open(&wire.frame().await)
        .expect("the host's answer");
    assert_eq!(message_json(paired)["type"], "paired");
    check
}

/// Reconnects as a paired phone and waits until the host answers `welcome`.
async fn connect(host: &Host, keys: PhoneKeys) -> (PhoneConnection, UnboundedReceiver<PhoneEvent>) {
    let (phone, mut events) = PhoneConnection::connect(
        host.computer(),
        keys,
        Dialer::without_tls(),
        PhoneOptions::DEFAULT,
    )
    .await
    .expect("the gateway takes the connection");
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Status(PhoneStatus::Connecting)
    );
    assert_eq!(next(&mut events).await, PhoneEvent::SessionOpened);
    phone.send(hello()).await.expect("hello goes out");
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Status(PhoneStatus::Connected)
    );
    let PhoneEvent::Message(welcome) = next(&mut events).await else {
        panic!("expected the host's welcome");
    };
    let welcome: Value = serde_json::from_slice(&welcome).expect("a JSON welcome");
    assert_eq!(welcome["type"], "welcome");
    assert_eq!(welcome["replyTo"], "h1");
    assert_eq!(welcome["version"], 2);
    (phone, events)
}

#[tokio::test]
#[ignore = "needs pnpm and the workspace's packages; CI's Rust job runs it"]
async fn gateway_interop_pairs_from_a_qr_code_and_speaks_inside_the_session() {
    let mut host = Host::start().await;
    let mut wire = Wire::open(&host).await;
    let keys = PhoneKeys::generate().expect("phone keys");
    let route = PairingRoute::Qr {
        host_key: host.host_key,
    };
    let mut check = pair(&mut host, &mut wire, &keys, route).await;

    for frame in check.session.seal(&hello(), Instant::now()).expect("hello") {
        wire.send(frame).await;
    }
    let welcome = message_json(
        check
            .session
            .open(&wire.frame().await)
            .expect("the welcome"),
    );
    assert_eq!(welcome["type"], "welcome");
    assert_eq!(welcome["replyTo"], "h1");
}

#[tokio::test]
#[ignore = "needs pnpm and the workspace's packages; CI's Rust job runs it"]
async fn gateway_interop_pairs_from_a_typed_code_then_reconnects() {
    let mut host = Host::start().await;
    let keys = PhoneKeys::generate().expect("phone keys");
    {
        let mut wire = Wire::open(&host).await;
        pair(&mut host, &mut wire, &keys, PairingRoute::Typed).await;
    }

    let private = *keys.private();
    let (phone, _events) = connect(&host, keys).await;
    phone.close();
    // The same key reconnects again, on a second connection.
    let keys = PhoneKeys::from_private(&private).expect("the same keys");
    let (phone, _events) = connect(&host, keys).await;
    phone.close();
}

#[tokio::test]
#[ignore = "needs pnpm and the workspace's packages; CI's Rust job runs it"]
async fn gateway_interop_is_removed_once_the_host_revokes_it() {
    let mut host = Host::start().await;
    let keys = PhoneKeys::generate().expect("phone keys");
    {
        let mut wire = Wire::open(&host).await;
        pair(&mut host, &mut wire, &keys, PairingRoute::Typed).await;
    }

    let public = *keys.public();
    let (_phone, mut events) = connect(&host, keys).await;
    host.revoke(&public);
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Status(PhoneStatus::Removed)
    );
}

#[tokio::test]
#[ignore = "needs pnpm and the workspace's packages; CI's Rust job runs it"]
async fn gateway_interop_cant_confirm_a_host_with_another_key() {
    let host = Host::start().await;
    let other_host = PhoneKeys::generate().expect("another key");
    let computer = PairedComputer {
        host_key: *other_host.public(),
        ..host.computer()
    };
    let keys = PhoneKeys::generate().expect("phone keys");
    let (phone, mut events) =
        PhoneConnection::connect(computer, keys, Dialer::without_tls(), PhoneOptions::DEFAULT)
            .await
            .expect("the gateway takes the connection");
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Status(PhoneStatus::Connecting)
    );
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Status(PhoneStatus::CantConfirm)
    );
    phone.close();
}

#[tokio::test]
#[ignore = "needs pnpm and the workspace's packages; CI's Rust job runs it"]
async fn gateway_interop_a_wrong_code_is_refused_with_the_tries_left() {
    let host = Host::start().await;
    let mut wire = Wire::open(&host).await;
    let keys = PhoneKeys::generate().expect("phone keys");
    // A well-formed code that isn't the open one: the host learns that only
    // when message 3 doesn't decrypt.
    let wrong = PairingCode::parse("XX7A9Q36KFB3").expect("a plain code");
    assert_ne!(host.code, "XX7A9Q36KFB3");
    let (pairing, frame1) =
        Pairing::start(&keys, &wrong, PairingRoute::Typed, &pixel()).expect("message 1");
    wire.send(frame1).await;
    let mut check = pairing
        .read_reply(&wire.frame().await, Instant::now())
        .expect("the host's message 2");
    wire.send(check.frame3.clone()).await;

    assert_eq!(
        check.session.open(&wire.frame().await),
        Err(SessionError::PairRefused {
            reason: PairRefusedReason::WrongCode,
            tries_left: 4,
        })
    );
}

fn from_hex(text: &str) -> [u8; 32] {
    let bytes: Vec<u8> = (0..text.len())
        .step_by(2)
        .map(|at| u8::from_str_radix(&text[at..at + 2], 16).expect("hex"))
        .collect();
    bytes.try_into().expect("32 bytes")
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
