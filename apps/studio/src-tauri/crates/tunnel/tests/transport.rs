//! The transport against a WebSocket gateway on loopback.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use halonic_tunnel::{
    Backoff, ConnectError, ConnectionId, Dialer, Endpoint, MAX_FRAME_BYTES, SendError, Timeouts,
    Transport, TransportEvent, TransportState,
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

/// Short limits, so a stalled connection gives up within the test.
const SHORT: Timeouts = Timeouts {
    send: Duration::from_millis(200),
    close: Duration::from_millis(200),
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

/// A transport with its first connection open, and the gateway's side.
struct Connected {
    listener: TcpListener,
    transport: Transport,
    events: Events,
    connection: ConnectionId,
    server: Server,
}

/// Connects a transport and gives the gateway's side of its connection.
async fn connected() -> Connected {
    let (listener, endpoint) = gateway().await;
    let (connecting, server) = tokio::join!(
        Transport::connect(endpoint, Dialer::without_tls(), FAST, SHORT),
        accept(&listener)
    );
    let (transport, mut events) = connecting.expect("the first connection");
    let connection = until_opened(&mut events).await;
    Connected {
        listener,
        transport,
        events,
        connection,
        server,
    }
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

/// Waits for the next connection to open and gives its id.
async fn until_opened(events: &mut Events) -> ConnectionId {
    loop {
        if let TransportEvent::Opened(connection) = next(events).await {
            return connection;
        }
    }
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
    let Connected {
        listener: _listener,
        transport,
        mut events,
        connection,
        mut server,
    } = connected().await;
    transport.send(connection, vec![0x20, 1, 2]).await.unwrap();
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
    let refused = Transport::connect(endpoint, Dialer::without_tls(), FAST, SHORT).await;
    assert_eq!(refused.err(), Some(ConnectError::Refused));
}

#[tokio::test]
async fn tunnel_transport_reconnects_after_a_drop_without_resending() {
    let Connected {
        listener,
        transport,
        mut events,
        connection,
        server,
    } = connected().await;
    drop(server);
    until_state(&mut events, TransportState::Reconnecting).await;
    assert_eq!(
        transport.send(connection, vec![0x20, 9]).await,
        Err(SendError::NotOpen)
    );

    let mut again = accept(&listener).await;
    let reconnected = until_opened(&mut events).await;
    assert_ne!(reconnected, connection);
    assert_eq!(server_frame(&mut again).await, None);
    transport.send(reconnected, vec![0x20, 10]).await.unwrap();
    assert_eq!(
        server_frame(&mut again).await,
        Some(Message::Binary(vec![0x20, 10].into()))
    );
}

#[tokio::test]
async fn tunnel_transport_refuses_a_frame_for_an_earlier_connection() {
    let Connected {
        listener,
        transport,
        mut events,
        connection,
        server,
    } = connected().await;
    drop(server);
    let mut again = accept(&listener).await;
    let reconnected = until_opened(&mut events).await;

    // Open again, but the frame was for the connection that dropped.
    assert_eq!(
        transport.send(connection, vec![0x20, 11]).await,
        Err(SendError::NotOpen)
    );
    // A drop for it doesn't close the new one either.
    transport.drop_connection(connection);
    transport.send(reconnected, vec![0x20, 12]).await.unwrap();
    assert_eq!(
        server_frame(&mut again).await,
        Some(Message::Binary(vec![0x20, 12].into()))
    );
    assert_eq!(transport.state(), TransportState::Open);
}

#[tokio::test]
async fn tunnel_transport_drops_a_connection_whose_peer_stops_reading() {
    // The gateway upgrades and never reads, so the socket buffers fill up.
    let Connected {
        listener: _listener,
        transport,
        mut events,
        connection,
        server: _never_read,
    } = connected().await;
    let largest = vec![0x20; MAX_FRAME_BYTES];
    let stalled = timeout(WAIT, async {
        while transport.send(connection, largest.clone()).await.is_ok() {}
    })
    .await;
    assert!(stalled.is_ok(), "a send gives up after its time limit");
    until_state(&mut events, TransportState::Reconnecting).await;

    // The worker takes commands again.
    transport.pause();
    until_state(&mut events, TransportState::Paused).await;
}

#[tokio::test]
async fn tunnel_transport_reports_each_failed_try() {
    let Connected {
        listener,
        transport: _transport,
        mut events,
        server,
        ..
    } = connected().await;
    drop((listener, server));
    until_state(&mut events, TransportState::Reconnecting).await;
    assert_eq!(
        next(&mut events).await,
        TransportEvent::TryFailed(ConnectError::Refused)
    );
}

#[tokio::test]
async fn tunnel_transport_pauses_and_resumes_at_once() {
    let Connected {
        listener,
        transport,
        mut events,
        connection,
        mut server,
    } = connected().await;
    transport.pause();
    until_state(&mut events, TransportState::Paused).await;
    assert!(matches!(
        server_frame(&mut server).await,
        None | Some(Message::Close(_))
    ));
    assert_eq!(
        transport.send(connection, vec![0x20]).await,
        Err(SendError::NotOpen)
    );
    // Paused, nothing tries again.
    assert!(
        timeout(Duration::from_millis(300), listener.accept())
            .await
            .is_err()
    );

    transport.resume();
    until_state(&mut events, TransportState::Connecting).await;
    let _again = accept(&listener).await;
    until_opened(&mut events).await;
    assert_eq!(transport.state(), TransportState::Open);
}

#[tokio::test]
async fn tunnel_transport_drops_a_connection_on_request_and_backs_off() {
    let Connected {
        listener,
        transport,
        mut events,
        connection,
        mut server,
    } = connected().await;
    transport.drop_connection(connection);
    until_state(&mut events, TransportState::Reconnecting).await;
    assert!(matches!(
        server_frame(&mut server).await,
        None | Some(Message::Close(_))
    ));
    let _again = accept(&listener).await;
    until_opened(&mut events).await;
}

#[tokio::test]
async fn tunnel_transport_ends_its_events_when_closed() {
    let Connected {
        listener: _listener,
        transport,
        mut events,
        connection,
        server: _server,
    } = connected().await;
    transport.close();
    until_state(&mut events, TransportState::Closed).await;
    assert_eq!(timeout(WAIT, events.recv()).await.unwrap(), None);
    assert_eq!(
        transport.send(connection, vec![0x20]).await,
        Err(SendError::NotOpen)
    );
}

#[tokio::test]
async fn tunnel_transport_drops_a_text_frame() {
    let Connected {
        listener: _listener,
        transport: _transport,
        mut events,
        mut server,
        ..
    } = connected().await;
    server.send(Message::text("hello")).await.unwrap();
    assert_eq!(
        next(&mut events).await,
        TransportEvent::State(TransportState::Reconnecting)
    );
}

#[tokio::test]
async fn tunnel_transport_drops_a_frame_over_the_limit() {
    let Connected {
        listener: _listener,
        transport: _transport,
        mut events,
        mut server,
        ..
    } = connected().await;
    let too_large = vec![0x20; MAX_FRAME_BYTES + 1];
    let _ = server.send(Message::Binary(too_large.into())).await;
    assert_eq!(
        next(&mut events).await,
        TransportEvent::State(TransportState::Reconnecting)
    );
}
