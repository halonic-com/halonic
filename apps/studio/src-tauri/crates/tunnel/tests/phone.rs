//! The phone's states for a paired computer, against a fake host on
//! loopback that speaks the reconnect handshake with `snow`.

mod support;

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use halonic_tunnel::{
    Backoff, ConnectError, Dialer, Endpoint, FrameKind, PairedComputer, PhoneConnection,
    PhoneEvent, PhoneKeys, PhoneOptions, PhoneStatus, Timeouts, frame,
};
use snow::TransportState;
use support::{FakeHost, open, read_handshake, seal, write_handshake};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::UnboundedReceiver;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{WebSocketStream, accept_async};

type Server = WebSocketStream<TcpStream>;
type Events = UnboundedReceiver<PhoneEvent>;

const WAIT: Duration = Duration::from_secs(5);

const FAST: PhoneOptions = PhoneOptions {
    backoff: Backoff {
        first_delay: Duration::from_millis(20),
        factor: 2,
        max_delay: Duration::from_millis(100),
        jitter: 0.2,
        reset_after: Duration::from_secs(30),
    },
    timeouts: Timeouts::TUNNEL,
    handshake_timeout: Duration::from_millis(300),
};

struct Gateway {
    listener: TcpListener,
    host: FakeHost,
}

impl Gateway {
    async fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        Self {
            listener,
            host: FakeHost::new(),
        }
    }

    fn computer(&self) -> PairedComputer {
        let port = self.listener.local_addr().unwrap().port();
        PairedComputer {
            endpoint: Endpoint::parse(&format!("tcp:127.0.0.1:{port}")).unwrap(),
            host_key: self.host.public_key(),
        }
    }

    async fn accept(&self) -> Server {
        let (stream, _) = timeout(WAIT, self.listener.accept())
            .await
            .unwrap()
            .unwrap();
        accept_async(stream).await.unwrap()
    }

    /// The host's side of a reconnect: reads message 1, answers message 2.
    async fn handshake(&self, server: &mut Server) -> TransportState {
        let message1 = binary(server).await;
        let mut noise = self.host.reconnect();
        read_handshake(&mut noise, FrameKind::Resume1, &message1).unwrap();
        let message2 = write_handshake(&mut noise, FrameKind::Resume2, &[]);
        server.send(Message::Binary(message2.into())).await.unwrap();
        noise.into_transport_mode().unwrap()
    }
}

async fn binary(server: &mut Server) -> Vec<u8> {
    match timeout(WAIT, server.next()).await.unwrap() {
        Some(Ok(Message::Binary(bytes))) => bytes.to_vec(),
        other => panic!("expected a binary frame, got {other:?}"),
    }
}

/// Connects the phone while the gateway accepts.
async fn connect(gateway: &Gateway) -> (PhoneConnection, Events, Server) {
    let keys = PhoneKeys::generate().unwrap();
    let (phone, server) = tokio::join!(
        PhoneConnection::connect(gateway.computer(), keys, Dialer::without_tls(), FAST),
        gateway.accept()
    );
    let (phone, mut events) = phone.expect("the first connection");
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Status(PhoneStatus::Connecting)
    );
    (phone, events, server)
}

async fn next(events: &mut Events) -> PhoneEvent {
    timeout(WAIT, events.recv())
        .await
        .expect("an event in time")
        .expect("an event")
}

/// Reads events until `wanted`, and fails on a Removed on the way.
async fn until(events: &mut Events, wanted: PhoneEvent) {
    loop {
        let event = next(events).await;
        if event == wanted {
            return;
        }
        assert_ne!(event, PhoneEvent::Status(PhoneStatus::Removed));
    }
}

#[tokio::test]
async fn phone_states_connected_after_welcome() {
    let gateway = Gateway::start().await;
    let (phone, mut events, mut server) = connect(&gateway).await;
    let mut host = gateway.handshake(&mut server).await;
    assert_eq!(next(&mut events).await, PhoneEvent::SessionOpened);

    phone.send(br#"{"type":"hello"}"#.to_vec()).await.unwrap();
    assert_eq!(
        open(&mut host, &binary(&mut server).await).1,
        br#"{"type":"hello"}"#
    );
    let welcome = seal(&mut host, FrameKind::Message, br#"{"type":"welcome"}"#);
    server.send(Message::Binary(welcome.into())).await.unwrap();
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Status(PhoneStatus::Connected)
    );
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Message(br#"{"type":"welcome"}"#.to_vec())
    );
}

#[tokio::test]
async fn phone_states_removed_only_inside_an_authenticated_session() {
    let gateway = Gateway::start().await;
    let (_phone, mut events, mut server) = connect(&gateway).await;
    let mut host = gateway.handshake(&mut server).await;
    until(&mut events, PhoneEvent::SessionOpened).await;
    let not_paired = seal(&mut host, FrameKind::Message, br#"{"type":"not-paired"}"#);
    server
        .send(Message::Binary(not_paired.into()))
        .await
        .unwrap();
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Status(PhoneStatus::Removed)
    );
    assert_eq!(timeout(WAIT, events.recv()).await.unwrap(), None);
}

#[tokio::test]
async fn phone_states_a_cleartext_not_paired_is_never_removed() {
    let gateway = Gateway::start().await;
    let (_phone, mut events, mut server) = connect(&gateway).await;
    binary(&mut server).await;
    let forged = frame(FrameKind::Message, br#"{"type":"not-paired"}"#);
    server.send(Message::Binary(forged.into())).await.unwrap();
    until(
        &mut events,
        PhoneEvent::Status(PhoneStatus::Reconnecting { last_try: None }),
    )
    .await;
}

#[tokio::test]
async fn phone_states_handshake_failed_is_cant_confirm_until_a_handshake_succeeds() {
    let gateway = Gateway::start().await;
    let (_phone, mut events, mut server) = connect(&gateway).await;
    binary(&mut server).await;
    server
        .send(Message::Binary(vec![0x30].into()))
        .await
        .unwrap();
    until(&mut events, PhoneEvent::Status(PhoneStatus::CantConfirm)).await;

    // It keeps trying, and a drop doesn't turn Can't confirm into Reconnecting.
    let mut again = gateway.accept().await;
    gateway.handshake(&mut again).await;
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Status(PhoneStatus::Connecting)
    );
    assert_eq!(next(&mut events).await, PhoneEvent::SessionOpened);
}

#[tokio::test]
async fn phone_states_a_silent_host_times_out_the_handshake() {
    let gateway = Gateway::start().await;
    let (_phone, mut events, mut server) = connect(&gateway).await;
    binary(&mut server).await;
    until(
        &mut events,
        PhoneEvent::Status(PhoneStatus::Reconnecting { last_try: None }),
    )
    .await;
    let _again = gateway.accept().await;
}

#[tokio::test]
async fn phone_states_say_why_the_first_try_failed() {
    let gateway = Gateway::start().await;
    let computer = gateway.computer();
    drop(gateway);
    let keys = PhoneKeys::generate().unwrap();
    let refused = PhoneConnection::connect(computer, keys, Dialer::without_tls(), FAST).await;
    assert_eq!(refused.err(), Some(ConnectError::Refused));
}

#[tokio::test]
async fn phone_states_pause_and_resume_with_a_new_handshake() {
    let gateway = Gateway::start().await;
    let (phone, mut events, mut server) = connect(&gateway).await;
    gateway.handshake(&mut server).await;
    until(&mut events, PhoneEvent::SessionOpened).await;

    phone.pause();
    until(&mut events, PhoneEvent::Status(PhoneStatus::Paused)).await;
    assert!(phone.send(b"{}".to_vec()).await.is_err());
    phone.resume();
    let mut again = gateway.accept().await;
    gateway.handshake(&mut again).await;
    until(&mut events, PhoneEvent::SessionOpened).await;
}
