//! The phone tunnel service against a fake computer on loopback: the
//! tunnel crate's fake host, a gateway that speaks both handshakes with
//! it, a host that records what the service tells the page, and a
//! paired-computer list in a scratch folder with the fake key wrapper.

#![allow(dead_code)]

#[path = "../../../tunnel/tests/support/mod.rs"]
pub mod support;

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use halonic_device_keys::{ComputerId, FakeWrapper, PairedComputers, WrappedFileStore};
use halonic_owner_check::{Decision, FakeOwnerCheck};
use halonic_phone_tunnel::{
    AwayAnswer, ConnectOutcome, LocalNetwork, LocalNetworkAnswer, Options, OwnerAnswer, PageStatus,
    PairingOutcome, PairingStart, PairingStep, PhoneAnswer, PhoneTunnel, TunnelHost, confirm_with,
    times_away_with,
};
use halonic_tunnel::{
    Backoff, Dialer, FrameKind, PairingOptions, PhoneDetails, PhoneOptions, Platform, Timeouts,
};
use serde_json::json;
use snow::{HandshakeState, TransportState};
use support::{FakeHost, open, read_handshake, write_handshake};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender, unbounded_channel};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{WebSocketStream, accept_async};

pub type Server = WebSocketStream<TcpStream>;
pub type Store = WrappedFileStore<FakeWrapper>;

pub const CODE: &str = "XX7A9Q36KFB3";
pub const OTHER_CODE: &str = "22222222222A";
pub const WAIT: Duration = Duration::from_secs(5);
/// The fixed time the service's clock gives in the tests.
/// A `hello` as the page sends it.
pub const HELLO: &str = r#"{"type":"hello","id":"h1","version":2}"#;

pub const NOW_MS: u64 = 1_800_000_000_000;

fn now() -> u64 {
    NOW_MS
}

pub const FAST: Options = Options {
    pairing: PairingOptions {
        timeouts: Timeouts::TUNNEL,
        handshake_timeout: Duration::from_millis(500),
        allow_timeout: Duration::from_secs(3),
    },
    phone: PhoneOptions {
        backoff: Backoff {
            first_delay: Duration::from_millis(20),
            factor: 2,
            max_delay: Duration::from_millis(100),
            jitter: 0.2,
            reset_after: Duration::from_secs(30),
        },
        timeouts: Timeouts::TUNNEL,
        handshake_timeout: Duration::from_millis(500),
    },
    clock: now,
};

/// What the service told the page about a computer's sessions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Told {
    Opened {
        computer: String,
        generation: u64,
    },
    Message {
        computer: String,
        generation: u64,
        text: String,
    },
}

/// The app around the service, recording what it is told.
pub struct Recorder {
    local_network: LocalNetwork,
    pub asked: AtomicUsize,
    statuses: UnboundedSender<(String, PageStatus)>,
    told: UnboundedSender<Told>,
    pub logs: Mutex<Vec<String>>,
    /// When set, the next host message holds the service up, after it is
    /// told, until the test sends on the other end: a page busy with one
    /// message while the next ones wait in the connection's channel.
    pub pause: Mutex<Option<std::sync::mpsc::Receiver<()>>>,
    /// The phone's owner check; `None` for a phone that has none.
    pub owner: Option<FakeOwnerCheck>,
}

impl TunnelHost for Recorder {
    fn allow_local_network(&self) -> LocalNetworkAnswer<'_> {
        self.asked.fetch_add(1, Ordering::Relaxed);
        let answer = self.local_network;
        Box::pin(async move { answer })
    }

    fn phone(&self) -> PhoneAnswer<'_> {
        Box::pin(async {
            PhoneDetails {
                name: "Pixel 9".to_owned(),
                platform: Platform::Android,
            }
        })
    }

    fn confirm_owner(&self, decision: Decision) -> OwnerAnswer<'_> {
        Box::pin(confirm_with(self.owner.as_ref(), decision))
    }

    fn times_away(&self) -> AwayAnswer<'_> {
        Box::pin(times_away_with(self.owner.as_ref()))
    }

    fn status_changed(&self, computer: &ComputerId, status: &PageStatus) {
        let _ = self.statuses.send((computer.as_str().to_owned(), *status));
    }

    fn session_opened(&self, computer: &ComputerId, generation: u64) {
        let _ = self.told.send(Told::Opened {
            computer: computer.as_str().to_owned(),
            generation,
        });
    }

    fn message(&self, computer: &ComputerId, generation: u64, text: &str) {
        let _ = self.told.send(Told::Message {
            computer: computer.as_str().to_owned(),
            generation,
            text: text.to_owned(),
        });
        let paused = self.pause.lock().unwrap().take();
        if let Some(resume) = paused {
            let _ = resume.recv();
        }
    }

    fn log(&self, line: &str) {
        self.logs.lock().unwrap().push(line.to_owned());
    }
}

/// The service with its list in a scratch folder, removed when dropped.
pub struct Phone {
    pub tunnel: PhoneTunnel<Store>,
    pub host: Arc<Recorder>,
    statuses: UnboundedReceiver<(String, PageStatus)>,
    told: UnboundedReceiver<Told>,
    folder: PathBuf,
}

impl Phone {
    pub fn new(name: &str, local_network: LocalNetwork) -> Self {
        Self::with_owner_check(name, local_network, Some(FakeOwnerCheck::new()))
    }

    /// A phone whose owner check is `owner`, or that has none.
    pub fn with_owner_check(
        name: &str,
        local_network: LocalNetwork,
        owner: Option<FakeOwnerCheck>,
    ) -> Self {
        let folder =
            std::env::temp_dir().join(format!("phone-tunnel-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        let (sender, statuses) = unbounded_channel();
        let (telling, told) = unbounded_channel();
        let host = Arc::new(Recorder {
            local_network,
            asked: AtomicUsize::new(0),
            statuses: sender,
            told: telling,
            logs: Mutex::new(Vec::new()),
            pause: Mutex::new(None),
            owner,
        });
        let tunnel = PhoneTunnel::new(
            list(&folder),
            Dialer::without_tls(),
            Arc::clone(&host) as Arc<dyn TunnelHost>,
            FAST,
        );
        Self {
            tunnel,
            host,
            statuses,
            told,
            folder,
        }
    }

    /// Another view of the same list, as the next app start would read it.
    pub fn list(&self) -> PairedComputers<Store> {
        list(&self.folder)
    }

    /// The next status the page is told.
    pub async fn next_status(&mut self) -> (String, PageStatus) {
        timeout(WAIT, self.statuses.recv())
            .await
            .expect("a status in time")
            .expect("a status")
    }

    /// Statuses until `wanted`, for `computer`.
    pub async fn until_status(&mut self, computer: &str, wanted: PageStatus) {
        loop {
            let (told, status) = self.next_status().await;
            if told == computer && status == wanted {
                return;
            }
        }
    }

    /// The next thing the page is told about a session.
    pub async fn next_told(&mut self) -> Told {
        timeout(WAIT, self.told.recv())
            .await
            .expect("a session event in time")
            .expect("a session event")
    }

    /// Waits for a session to `computer` to open, and gives its generation.
    pub async fn session_opened(&mut self, computer: &str) -> u64 {
        loop {
            if let Told::Opened {
                computer: told,
                generation,
            } = self.next_told().await
                && told == computer
            {
                return generation;
            }
        }
    }

    /// Whether the page is told nothing about a session within a short
    /// while.
    pub async fn no_told(&mut self) -> bool {
        timeout(Duration::from_millis(200), self.told.recv())
            .await
            .is_err()
    }

    /// Whether no status comes within a short while.
    pub async fn no_status(&mut self) -> bool {
        timeout(Duration::from_millis(200), self.statuses.recv())
            .await
            .is_err()
    }

    /// Pairs with `gateway` on the typed route and gives the computer's id.
    pub async fn pair(&self, gateway: &Gateway) -> String {
        self.pair_from(gateway, gateway.typed_start()).await
    }

    /// Pairs with `gateway` from the page's `start`, and gives the
    /// computer's id.
    pub async fn pair_from(&self, gateway: &Gateway, start: PairingStart) -> String {
        let (step, (server, noise)) = tokio::join!(
            self.tunnel.pair_start(start),
            gateway.run_to_message_3(CODE)
        );
        assert!(matches!(step, PairingStep::Check { .. }), "{step:?}");
        let (outcome, ()) = tokio::join!(
            self.tunnel.pair_wait(),
            gateway.answer_paired(server, noise)
        );
        let PairingOutcome::Paired(computer) = outcome else {
            panic!("paired, not {outcome:?}");
        };
        computer.id
    }
}

impl Drop for Phone {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.folder);
    }
}

fn list(folder: &std::path::Path) -> PairedComputers<Store> {
    let keys = WrappedFileStore::new(folder.join("device-keys"), FakeWrapper::new());
    PairedComputers::new(folder.join("paired-computers"), keys)
}

/// A computer's gateway on loopback.
pub struct Gateway {
    pub listener: TcpListener,
    pub host: FakeHost,
}

impl Gateway {
    pub async fn start() -> Self {
        Self {
            listener: TcpListener::bind("127.0.0.1:0").await.unwrap(),
            host: FakeHost::new(),
        }
    }

    pub fn endpoint(&self) -> String {
        let port = self.listener.local_addr().unwrap().port();
        format!("tcp://127.0.0.1:{port}")
    }

    pub fn typed_start(&self) -> PairingStart {
        start(json!({ "route": "typed", "code": CODE, "endpoints": [self.endpoint()] }))
    }

    pub async fn accept(&self) -> Server {
        let (stream, _) = timeout(WAIT, self.listener.accept())
            .await
            .unwrap()
            .unwrap();
        timeout(WAIT, accept_async(stream)).await.unwrap().unwrap()
    }

    /// The computer's side of a pairing with `code`, up to reading message
    /// 3; a message 3 for another code doesn't decrypt.
    pub async fn run_to_message_3(&self, code: &str) -> (Server, HandshakeState) {
        let mut server = self.accept().await;
        let mut noise = self.host.pairing(code);
        read_handshake(&mut noise, FrameKind::Pair1, &binary(&mut server).await).unwrap();
        let payload = json!({ "hostName": "Desk" }).to_string();
        let frame2 = write_handshake(&mut noise, FrameKind::Pair2, payload.as_bytes());
        send(&mut server, frame2).await;
        let frame3 = binary(&mut server).await;
        let _ = read_handshake(&mut noise, FrameKind::Pair3, &frame3);
        (server, noise)
    }

    /// Allow pressed: the encrypted `paired`.
    pub async fn answer_paired(&self, mut server: Server, noise: HandshakeState) {
        let mut session = noise.into_transport_mode().unwrap();
        let paired = support::seal(&mut session, FrameKind::Message, br#"{"type":"paired"}"#);
        send(&mut server, paired).await;
        // Keep the connection open until the phone has read the answer.
        let _ = timeout(Duration::from_millis(300), server.next()).await;
    }

    /// The computer's side of a reconnect.
    pub async fn reconnect(&self, server: &mut Server) -> TransportState {
        let mut noise = self.host.reconnect();
        read_handshake(&mut noise, FrameKind::Resume1, &binary(server).await).unwrap();
        let message2 = write_handshake(&mut noise, FrameKind::Resume2, &[]);
        send(server, message2).await;
        noise.into_transport_mode().unwrap()
    }
}

pub fn start(value: serde_json::Value) -> PairingStart {
    serde_json::from_value(value).expect("a start the page sends")
}

/// A paired computer, connected, with its first session open: the
/// computer's id, its side of the connection and of the session, and the
/// session's generation.
pub async fn connected(
    phone: &mut Phone,
    gateway: &Gateway,
) -> (String, Server, TransportState, u64) {
    let id = phone.pair(gateway).await;
    let (outcome, mut server) = tokio::join!(phone.tunnel.connect(&id), gateway.accept());
    assert_eq!(outcome, ConnectOutcome::Connecting);
    let session = gateway.reconnect(&mut server).await;
    let generation = phone.session_opened(&id).await;
    (id, server, session, generation)
}

/// The next message the computer reads, decrypted.
pub async fn next_message(server: &mut Server, session: &mut TransportState) -> String {
    let (kind, message) = open(session, &binary(server).await);
    assert_eq!(kind, FrameKind::Message);
    String::from_utf8(message).expect("text")
}

pub async fn binary(server: &mut Server) -> Vec<u8> {
    match timeout(WAIT, server.next()).await.unwrap() {
        Some(Ok(Message::Binary(bytes))) => bytes.to_vec(),
        other => panic!("expected a binary frame, got {other:?}"),
    }
}

pub async fn send(server: &mut Server, bytes: Vec<u8>) {
    server.send(Message::Binary(bytes.into())).await.unwrap();
}

/// Whether the phone closed the connection within the wait.
pub async fn closed(server: &mut Server) -> bool {
    loop {
        match timeout(WAIT, server.next()).await {
            Err(_) => return false,
            Ok(None | Some(Err(_) | Ok(Message::Close(_)))) => return true,
            Ok(Some(Ok(_))) => {}
        }
    }
}
