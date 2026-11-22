//! A phone connection against a fake host on loopback that speaks the
//! reconnect handshake with `snow`, for the phone's tests.

#![allow(dead_code)]

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use halonic_tunnel::{
    Backoff, Dialer, Endpoint, FrameKind, PairedComputer, PhoneConnection, PhoneEvent, PhoneKeys,
    PhoneOptions, PhoneStatus, Timeouts,
};
use snow::TransportState;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::UnboundedReceiver;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{WebSocketStream, accept_async};

use crate::support::{FakeHost, read_handshake, write_handshake};

pub type Server = WebSocketStream<TcpStream>;
pub type Events = UnboundedReceiver<PhoneEvent>;

pub const WAIT: Duration = Duration::from_secs(5);

pub const FAST: PhoneOptions = PhoneOptions {
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

pub struct Gateway {
    pub listener: TcpListener,
    pub host: FakeHost,
}

impl Gateway {
    pub async fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        Self {
            listener,
            host: FakeHost::new(),
        }
    }

    pub fn computer(&self) -> PairedComputer {
        let port = self.listener.local_addr().unwrap().port();
        PairedComputer {
            endpoint: Endpoint::parse(&format!("tcp:127.0.0.1:{port}")).unwrap(),
            host_key: self.host.public_key(),
        }
    }

    /// Accepts the next WebSocket connection. A TCP connection the phone
    /// gave up on before the upgrade, a try cut short by a pause, is skipped.
    pub async fn accept(&self) -> Server {
        loop {
            let (stream, _) = timeout(WAIT, self.listener.accept())
                .await
                .unwrap()
                .unwrap();
            if let Ok(server) = timeout(WAIT, accept_async(stream)).await.unwrap() {
                return server;
            }
        }
    }

    /// The host's side of a reconnect: reads message 1, answers message 2.
    pub async fn handshake(&self, server: &mut Server) -> TransportState {
        let message1 = binary(server).await;
        let mut noise = self.host.reconnect();
        read_handshake(&mut noise, FrameKind::Resume1, &message1).unwrap();
        let message2 = write_handshake(&mut noise, FrameKind::Resume2, &[]);
        server.send(Message::Binary(message2.into())).await.unwrap();
        noise.into_transport_mode().unwrap()
    }
}

pub async fn binary(server: &mut Server) -> Vec<u8> {
    match timeout(WAIT, server.next()).await.unwrap() {
        Some(Ok(Message::Binary(bytes))) => bytes.to_vec(),
        other => panic!("expected a binary frame, got {other:?}"),
    }
}

/// Connects the phone while the gateway accepts.
pub async fn connect(gateway: &Gateway) -> (PhoneConnection, Events, Server) {
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

pub async fn next(events: &mut Events) -> PhoneEvent {
    timeout(WAIT, events.recv())
        .await
        .expect("an event in time")
        .expect("an event")
}

/// Reads events until `wanted`, and fails on a Removed on the way.
pub async fn until(events: &mut Events, wanted: PhoneEvent) {
    loop {
        let event = next(events).await;
        if event == wanted {
            return;
        }
        assert_ne!(event, PhoneEvent::Status(PhoneStatus::Removed));
    }
}
