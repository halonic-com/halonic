//! The phone's states for a paired computer, against a fake host on
//! loopback that speaks the reconnect handshake with `snow`.

mod phone_gateway;
mod support;

use std::time::Duration;

use futures_util::SinkExt;
use halonic_tunnel::{
    Backoff, ConnectError, Dialer, FrameKind, PhoneConnection, PhoneEvent, PhoneKeys, PhoneOptions,
    PhoneStatus, frame,
};
use phone_gateway::{FAST, Gateway, WAIT, binary, connect, next, until};
use support::{open, read_handshake, seal, write_handshake};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn phone_states_connected_after_welcome() {
    let gateway = Gateway::start().await;
    let (phone, mut events, mut server) = connect(&gateway).await;
    let mut host = gateway.handshake(&mut server).await;
    assert_eq!(next(&mut events).await, PhoneEvent::SessionOpened(1));

    phone
        .send(1, br#"{"type":"hello"}"#.to_vec())
        .await
        .unwrap();
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
    until(&mut events, PhoneEvent::SessionOpened(1)).await;
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
    assert_eq!(next(&mut events).await, PhoneEvent::SessionOpened(1));
}

#[tokio::test]
async fn phone_states_cant_confirm_survives_a_pause() {
    let gateway = Gateway::start().await;
    let (phone, mut events, mut server) = connect(&gateway).await;
    binary(&mut server).await;
    server
        .send(Message::Binary(vec![0x30].into()))
        .await
        .unwrap();
    until(&mut events, PhoneEvent::Status(PhoneStatus::CantConfirm)).await;

    phone.pause();
    until(&mut events, PhoneEvent::Status(PhoneStatus::Paused)).await;
    phone.resume();
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Status(PhoneStatus::CantConfirm)
    );
    let mut again = gateway.accept().await;
    gateway.handshake(&mut again).await;
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Status(PhoneStatus::Connecting)
    );
    assert_eq!(next(&mut events).await, PhoneEvent::SessionOpened(1));
}

#[tokio::test]
async fn phone_states_a_message_2_that_does_not_decrypt_is_cant_confirm() {
    let gateway = Gateway::start().await;
    let (_phone, mut events, mut server) = connect(&gateway).await;
    let message1 = binary(&mut server).await;
    let mut noise = gateway.host.reconnect();
    read_handshake(&mut noise, FrameKind::Resume1, &message1).unwrap();
    let mut message2 = write_handshake(&mut noise, FrameKind::Resume2, &[]);
    let last = message2.len() - 1;
    message2[last] ^= 1;
    server.send(Message::Binary(message2.into())).await.unwrap();
    until(&mut events, PhoneEvent::Status(PhoneStatus::CantConfirm)).await;
    let _again = gateway.accept().await;
}

#[tokio::test]
async fn phone_states_a_cleartext_not_paired_inside_the_session_only_drops_it() {
    let gateway = Gateway::start().await;
    let (_phone, mut events, mut server) = connect(&gateway).await;
    gateway.handshake(&mut server).await;
    until(&mut events, PhoneEvent::SessionOpened(1)).await;
    let forged = frame(FrameKind::Message, br#"{"type":"not-paired"}"#);
    server.send(Message::Binary(forged.into())).await.unwrap();
    until(
        &mut events,
        PhoneEvent::Status(PhoneStatus::Reconnecting { last_try: None }),
    )
    .await;
    let mut again = gateway.accept().await;
    gateway.handshake(&mut again).await;
    until(&mut events, PhoneEvent::SessionOpened(2)).await;
}

#[tokio::test]
async fn phone_states_ignore_frames_from_a_connection_they_dropped() {
    let gateway = Gateway::start().await;
    let (_phone, mut events, mut server) = connect(&gateway).await;
    let mut host = gateway.handshake(&mut server).await;
    until(&mut events, PhoneEvent::SessionOpened(1)).await;
    // A frame that doesn't open drops the session; a genuine `not-paired`
    // sent right behind it, on the same connection, must not count.
    let garbage = frame(FrameKind::Message, b"not sealed");
    let not_paired = seal(&mut host, FrameKind::Message, br#"{"type":"not-paired"}"#);
    server.feed(Message::Binary(garbage.into())).await.unwrap();
    server
        .feed(Message::Binary(not_paired.into()))
        .await
        .unwrap();
    server.flush().await.unwrap();
    until(
        &mut events,
        PhoneEvent::Status(PhoneStatus::Reconnecting { last_try: None }),
    )
    .await;
    let mut again = gateway.accept().await;
    gateway.handshake(&mut again).await;
    until(&mut events, PhoneEvent::SessionOpened(2)).await;
}

#[tokio::test]
async fn phone_states_close_when_the_handle_is_dropped() {
    let gateway = Gateway::start().await;
    let (phone, mut events, mut server) = connect(&gateway).await;
    gateway.handshake(&mut server).await;
    until(&mut events, PhoneEvent::SessionOpened(1)).await;
    drop(phone);
    until(&mut events, PhoneEvent::Status(PhoneStatus::Closed)).await;
    assert_eq!(timeout(WAIT, events.recv()).await.unwrap(), None);
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
    until(&mut events, PhoneEvent::SessionOpened(1)).await;

    phone.pause();
    until(&mut events, PhoneEvent::Status(PhoneStatus::Paused)).await;
    assert!(phone.send(1, b"{}".to_vec()).await.is_err());
    phone.resume();
    let mut again = gateway.accept().await;
    gateway.handshake(&mut again).await;
    until(&mut events, PhoneEvent::SessionOpened(2)).await;
}

#[tokio::test]
async fn reconnect_next_try_phone_reports_the_wait_while_reconnecting() {
    let gateway = Gateway::start().await;
    let (_phone, mut events, mut server) = connect(&gateway).await;
    gateway.handshake(&mut server).await;
    until(&mut events, PhoneEvent::SessionOpened(1)).await;
    drop(server);
    assert_eq!(
        next(&mut events).await,
        PhoneEvent::Status(PhoneStatus::Reconnecting { last_try: None })
    );
    assert!(matches!(next(&mut events).await, PhoneEvent::NextTry(_)));
}

#[tokio::test]
async fn reconnect_next_try_phone_tries_now() {
    // A first wait of a minute: only "try now" can reconnect within the test.
    let slow = PhoneOptions {
        backoff: Backoff {
            first_delay: Duration::from_secs(60),
            max_delay: Duration::from_secs(60),
            ..FAST.backoff
        },
        ..FAST
    };
    let gateway = Gateway::start().await;
    let keys = PhoneKeys::generate().unwrap();
    let (phone, server) = tokio::join!(
        PhoneConnection::connect(gateway.computer(), keys, Dialer::without_tls(), slow),
        gateway.accept()
    );
    let (phone, mut events) = phone.expect("the first connection");
    let mut server = server;
    gateway.handshake(&mut server).await;
    until(&mut events, PhoneEvent::SessionOpened(1)).await;
    drop(server);
    until(
        &mut events,
        PhoneEvent::Status(PhoneStatus::Reconnecting { last_try: None }),
    )
    .await;
    phone.try_now();
    let mut again = gateway.accept().await;
    gateway.handshake(&mut again).await;
    until(&mut events, PhoneEvent::SessionOpened(2)).await;
}

#[tokio::test]
async fn reconnect_next_try_phone_try_now_does_nothing_while_paused() {
    let gateway = Gateway::start().await;
    let (phone, mut events, mut server) = connect(&gateway).await;
    gateway.handshake(&mut server).await;
    until(&mut events, PhoneEvent::SessionOpened(1)).await;

    phone.pause();
    until(&mut events, PhoneEvent::Status(PhoneStatus::Paused)).await;
    phone.try_now();
    // FAST tries again within 100 ms, so a quiet half second means no try.
    let quiet = timeout(Duration::from_millis(500), gateway.listener.accept()).await;
    assert!(quiet.is_err(), "Try now connected while paused");

    phone.resume();
    let mut again = gateway.accept().await;
    gateway.handshake(&mut again).await;
    until(&mut events, PhoneEvent::SessionOpened(2)).await;
}
