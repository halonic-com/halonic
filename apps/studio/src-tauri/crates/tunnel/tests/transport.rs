//! The transport against a WebSocket gateway on loopback.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use halonic_tunnel::{
    Backoff, ConnectError, Dialer, Endpoint, MAX_FRAME_BYTES, SendError, Transport, TransportEvent,
    TransportState,
};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::UnboundedReceiver;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{WebSocketStream, accept_async};

type Server = WebSocketStream<TcpStream>;
type Events = UnboundedReceiver<TransportEvent>;

const WAIT: Duration = Duration::from_secs(5);

/// The ADR's rule, sped up so the tests don't wait.
const FAST: Backoff = Backoff {
    first_delay: Duration::from_millis(20),
    factor: 2,
    max_delay: Duration::from_millis(100),
    jitter: 0.2,
    reset_after: Duration::from_secs(30),
};

async fn gateway() -> (TcpListener, Endpoint) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let endpoint = Endpoint::parse(&format!("tcp:127.0.0.1:{port}")).unwrap();
    (listener, endpoint)
}

async fn accept(listener: &TcpListener) -> Server {
    let (stream, _) = timeout(WAIT, listener.accept()).await.unwrap().unwrap();
    accept_async(stream).await.expect("a WebSocket upgrade")
}

/// Connects a transport and gives the gateway's side of its connection.
async fn connected() -> (TcpListener, Transport, Events, Server) {
    let (listener, endpoint) = gateway().await;
    let (connecting, server) = tokio::join!(
        Transport::connect(endpoint, Dialer::without_tls(), FAST),
        accept(&listener)
    );
    let (transport, mut events) = connecting.expect("the first connection");
    assert_eq!(
        next(&mut events).await,
        TransportEvent::State(TransportState::Open)
    );
    (listener, transport, events, server)
}

async fn next(events: &mut Events) -> TransportEvent {
    timeout(WAIT, events.recv())
        .await
        .expect("an event in time")
        .expect("an event")
}

async fn until_state(events: &mut Events, state: TransportState) {
    while next(events).await != TransportEvent::State(state) {}
}

async fn server_frame(server: &mut Server) -> Option<Message> {
    timeout(Duration::from_millis(300), server.next())
        .await
        .ok()
        .flatten()
        .and_then(Result::ok)
}

#[tokio::test]
async fn tunnel_transport_carries_binary_frames_both_ways() {
    let (_listener, transport, mut events, mut server) = connected().await;
    transport.send(vec![0x20, 1, 2]).await.unwrap();
    assert_eq!(
        server_frame(&mut server).await,
        Some(Message::Binary(vec![0x20, 1, 2].into()))
    );
    server
        .send(Message::Binary(vec![0x21, 3].into()))
        .await
        .unwrap();
    assert_eq!(
        next(&mut events).await,
        TransportEvent::Frame(vec![0x21, 3])
    );
    let largest = vec![0x20; MAX_FRAME_BYTES];
    server
        .send(Message::Binary(largest.clone().into()))
        .await
        .unwrap();
    assert_eq!(next(&mut events).await, TransportEvent::Frame(largest));
}

#[tokio::test]
async fn tunnel_transport_gives_the_reason_when_the_first_try_fails() {
    let (listener, endpoint) = gateway().await;
    drop(listener);
    let refused = Transport::connect(endpoint, Dialer::without_tls(), FAST).await;
    assert_eq!(refused.err(), Some(ConnectError::Refused));
}

#[tokio::test]
async fn tunnel_transport_reconnects_after_a_drop_without_resending() {
    let (listener, transport, mut events, server) = connected().await;
    drop(server);
    until_state(&mut events, TransportState::Reconnecting).await;
    assert_eq!(transport.send(vec![0x20, 9]).await, Err(SendError::NotOpen));

    let mut again = accept(&listener).await;
    until_state(&mut events, TransportState::Open).await;
    assert_eq!(server_frame(&mut again).await, None);
    transport.send(vec![0x20, 10]).await.unwrap();
    assert_eq!(
        server_frame(&mut again).await,
        Some(Message::Binary(vec![0x20, 10].into()))
    );
}

#[tokio::test]
async fn tunnel_transport_reports_each_failed_try() {
    let (listener, _transport, mut events, server) = connected().await;
    drop((listener, server));
    until_state(&mut events, TransportState::Reconnecting).await;
    assert_eq!(
        next(&mut events).await,
        TransportEvent::TryFailed(ConnectError::Refused)
    );
}

#[tokio::test]
async fn tunnel_transport_pauses_and_resumes_at_once() {
    let (listener, transport, mut events, mut server) = connected().await;
    transport.pause();
    until_state(&mut events, TransportState::Paused).await;
    assert!(matches!(
        server_frame(&mut server).await,
        None | Some(Message::Close(_))
    ));
    assert_eq!(transport.send(vec![0x20]).await, Err(SendError::NotOpen));
    // Paused, nothing tries again.
    assert!(
        timeout(Duration::from_millis(300), listener.accept())
            .await
            .is_err()
    );

    transport.resume();
    until_state(&mut events, TransportState::Connecting).await;
    let _again = accept(&listener).await;
    until_state(&mut events, TransportState::Open).await;
    assert_eq!(transport.state(), TransportState::Open);
}

#[tokio::test]
async fn tunnel_transport_drops_a_connection_on_request_and_backs_off() {
    let (listener, transport, mut events, mut server) = connected().await;
    transport.drop_connection();
    until_state(&mut events, TransportState::Reconnecting).await;
    assert!(matches!(
        server_frame(&mut server).await,
        None | Some(Message::Close(_))
    ));
    let _again = accept(&listener).await;
    until_state(&mut events, TransportState::Open).await;
}

#[tokio::test]
async fn tunnel_transport_ends_its_events_when_closed() {
    let (_listener, transport, mut events, _server) = connected().await;
    transport.close();
    until_state(&mut events, TransportState::Closed).await;
    assert_eq!(timeout(WAIT, events.recv()).await.unwrap(), None);
    assert_eq!(transport.send(vec![0x20]).await, Err(SendError::NotOpen));
}

#[tokio::test]
async fn tunnel_transport_drops_a_text_frame() {
    let (_listener, _transport, mut events, mut server) = connected().await;
    server.send(Message::text("hello")).await.unwrap();
    assert_eq!(
        next(&mut events).await,
        TransportEvent::State(TransportState::Reconnecting)
    );
}

#[tokio::test]
async fn tunnel_transport_drops_a_frame_over_the_limit() {
    let (_listener, _transport, mut events, mut server) = connected().await;
    let too_large = vec![0x20; MAX_FRAME_BYTES + 1];
    let _ = server.send(Message::Binary(too_large.into())).await;
    assert_eq!(
        next(&mut events).await,
        TransportEvent::State(TransportState::Reconnecting)
    );
}
