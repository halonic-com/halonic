//! The phone connection's numbered sessions (requirement
//! `session-numbers`): a message goes only into the session it was meant
//! for, and the app can end a session it refuses without the backoff
//! starting again.

mod support;

mod phone_gateway;

use std::time::Duration;

use halonic_tunnel::{
    Backoff, Dialer, PhoneConnection, PhoneEvent, PhoneKeys, PhoneOptions, PhoneStatus, SendError,
};
use phone_gateway::{FAST, Gateway, Server, binary, connect, next, until};
use support::open;
use tokio::time::timeout;

/// Backoff without jitter, reset as soon as a connection has opened: a
/// plain drop always waits `first_delay`, so a longer wait shows the
/// backoff went on.
const NO_RESET: PhoneOptions = PhoneOptions {
    backoff: Backoff {
        first_delay: Duration::from_millis(40),
        factor: 2,
        max_delay: Duration::from_secs(5),
        jitter: 0.0,
        reset_after: Duration::ZERO,
    },
    ..FAST
};

#[tokio::test]
async fn session_numbers_never_send_into_a_later_session() {
    let gateway = Gateway::start().await;
    let (phone, mut events, server) = connect(&gateway).await;
    let mut server = server;
    gateway.handshake(&mut server).await;
    until(&mut events, PhoneEvent::SessionOpened(1)).await;
    drop(server);

    let mut again = gateway.accept().await;
    let mut host = gateway.handshake(&mut again).await;
    until(&mut events, PhoneEvent::SessionOpened(2)).await;
    assert_eq!(
        phone.send(1, br#"{"type":"prompt"}"#.to_vec()).await,
        Err(SendError::NotOpen)
    );
    phone
        .send(2, br#"{"type":"hello"}"#.to_vec())
        .await
        .unwrap();

    // The first frame after the handshake is session 2's own message.
    let (_, message) = open(&mut host, &binary(&mut again).await);
    assert_eq!(message, br#"{"type":"hello"}"#);
}

#[tokio::test]
async fn session_numbers_end_only_the_session_named() {
    let gateway = Gateway::start().await;
    let (phone, mut events, mut server) = connect(&gateway).await;
    let mut host = gateway.handshake(&mut server).await;
    until(&mut events, PhoneEvent::SessionOpened(1)).await;

    phone.end_session(2);
    phone
        .send(1, br#"{"type":"hello"}"#.to_vec())
        .await
        .unwrap();
    let (_, message) = open(&mut host, &binary(&mut server).await);
    assert_eq!(message, br#"{"type":"hello"}"#);

    phone.end_session(1);
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Status(PhoneStatus::Reconnecting { last_try: None })
    );
    assert_eq!(
        phone.send(1, br#"{"type":"hello"}"#.to_vec()).await,
        Err(SendError::NotOpen)
    );
}

#[tokio::test]
async fn session_numbers_an_ended_session_keeps_the_backoff_going() {
    let gateway = Gateway::start().await;
    let keys = PhoneKeys::generate().unwrap();
    let (phone, server) = tokio::join!(
        PhoneConnection::connect(gateway.computer(), keys, Dialer::without_tls(), NO_RESET),
        gateway.accept()
    );
    let (phone, mut events) = phone.expect("the first connection");
    let mut server: Server = server;

    let mut waits = Vec::new();
    for session in 1..=2 {
        gateway.handshake(&mut server).await;
        until(&mut events, PhoneEvent::SessionOpened(session)).await;
        phone.end_session(session);
        waits.push(next_wait(&mut events).await);
        server = gateway.accept().await;
    }

    // A plain drop would wait 40 ms each time; the ended sessions count as
    // failed tries.
    assert_eq!(
        waits,
        [Duration::from_millis(40), Duration::from_millis(80)]
    );
}

/// The next "trying again in" wait.
async fn next_wait(events: &mut phone_gateway::Events) -> Duration {
    loop {
        let event = timeout(Duration::from_secs(5), next(events))
            .await
            .expect("a wait in time");
        if let PhoneEvent::NextTry(wait) = event {
            return wait;
        }
    }
}
