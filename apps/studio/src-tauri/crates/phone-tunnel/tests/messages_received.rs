//! The host's gateway messages, passed on to the page by the service, and
//! the sessions the page ends (requirement `phone-tunnel-messages`; Julian's
//! M4 on HAL-15181: no message text reaches the log).

mod common;

use common::support::{open, seal};
use common::{Gateway, Phone, Server, Told, binary, closed, send};
use halonic_phone_tunnel::{ConnectOutcome, LocalNetwork, SendRefusal};
use halonic_tunnel::FrameKind;
use snow::TransportState;

const MARKER: &str = "marker-91c4";

/// A paired computer, connected, with its first session open.
async fn connected(phone: &mut Phone, gateway: &Gateway) -> (String, Server, TransportState, u64) {
    let id = phone.pair(gateway).await;
    let (outcome, mut server) = tokio::join!(phone.tunnel.connect(&id), gateway.accept());
    assert_eq!(outcome, ConnectOutcome::Connecting);
    let session = gateway.reconnect(&mut server).await;
    let generation = phone.session_opened(&id).await;
    (id, server, session, generation)
}

/// The computer sends `message` in its session.
async fn host_sends(server: &mut Server, session: &mut TransportState, message: &[u8]) {
    let frame = seal(session, FrameKind::Message, message);
    send(server, frame).await;
}

#[tokio::test]
async fn phone_tunnel_messages_pass_host_messages_on_in_order() {
    let mut phone = Phone::new("messages-in-order", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (id, mut server, mut session, generation) = connected(&mut phone, &gateway).await;
    let messages = [
        r#"{"type":"welcome","replyTo":"h1","version":2}"#,
        r#"{"type":"sessions","replyTo":"l1","sessions":[]}"#,
        r#"{"type":"event","sessionId":"s1","seq":1}"#,
    ];

    for message in messages {
        host_sends(&mut server, &mut session, message.as_bytes()).await;
    }
    for message in messages {
        let told = Told::Message {
            computer: id.clone(),
            generation,
            text: message.to_owned(),
        };
        assert_eq!(phone.next_told().await, told);
    }
}

#[tokio::test]
async fn phone_tunnel_messages_end_only_the_session_the_page_names() {
    let mut phone = Phone::new("messages-end-session", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (id, mut server, mut session, first) = connected(&mut phone, &gateway).await;
    let hello = r#"{"type":"hello","id":"h1","version":2}"#;

    // A stale generation, or another computer, ends nothing.
    assert!(!phone.tunnel.end_session(&id, first + 1));
    assert!(!phone.tunnel.end_session("another-computer", first));
    phone.tunnel.send(&id, first, hello).await.unwrap();
    let (_, sent) = open(&mut session, &binary(&mut server).await);
    assert_eq!(sent, hello.as_bytes());

    assert!(phone.tunnel.end_session(&id, first));
    assert_eq!(
        phone.tunnel.send(&id, first, hello).await,
        Err(SendRefusal::NotOpen)
    );
    assert!(closed(&mut server).await);

    // The computer stays connected: the phone reconnects by itself, into a
    // new session.
    let mut again = gateway.accept().await;
    gateway.reconnect(&mut again).await;
    assert!(phone.session_opened(&id).await > first);
}

#[tokio::test]
async fn phone_tunnel_messages_end_a_session_whose_message_isnt_text() {
    let mut phone = Phone::new("messages-not-text", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (id, mut server, mut session, first) = connected(&mut phone, &gateway).await;

    host_sends(
        &mut server,
        &mut session,
        b"{\"type\":\"event\",\"x\":\"\xff\xfe\"}",
    )
    .await;
    assert!(closed(&mut server).await);
    let mut again = gateway.accept().await;
    gateway.reconnect(&mut again).await;
    // The page hears of the new session, and of no message before it.
    let told = phone.next_told().await;
    assert!(
        matches!(&told, Told::Opened { generation, .. } if *generation > first),
        "{told:?}"
    );
    assert_eq!(
        phone.tunnel.send(&id, first, r#"{"type":"hello"}"#).await,
        Err(SendRefusal::NotOpen)
    );
}

#[tokio::test]
async fn phone_tunnel_messages_keep_their_text_out_of_the_log() {
    let mut phone = Phone::new("messages-log", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (id, mut server, mut session, first) = connected(&mut phone, &gateway).await;
    let sent = format!(r#"{{"type":"prompt","id":"p1","sessionId":"s1","text":"{MARKER}"}}"#);
    let refused = [
        format!(r#"{{"type":"{MARKER}"}}"#),
        format!(r#"{{"type":"prompt","text":"{MARKER}"}} {MARKER}"#),
        format!(
            r#"{{"type":"prompt","text":"{MARKER}{}"}}"#,
            "a".repeat(70_000)
        ),
    ];

    phone.tunnel.send(&id, first, &sent).await.unwrap();
    for text in &refused {
        assert!(phone.tunnel.send(&id, first, text).await.is_err());
    }
    assert!(phone.tunnel.send(&id, first + 1, &sent).await.is_err());
    let received = format!(r#"{{"type":"event","sessionId":"s1","text":"{MARKER}"}}"#);
    host_sends(&mut server, &mut session, received.as_bytes()).await;
    assert!(matches!(phone.next_told().await, Told::Message { .. }));
    // A message that isn't text ends the session, which is logged.
    let not_text = [MARKER.as_bytes(), b"\xff"].concat();
    host_sends(&mut server, &mut session, &not_text).await;
    assert!(closed(&mut server).await);
    let mut again = gateway.accept().await;
    gateway.reconnect(&mut again).await;
    phone.session_opened(&id).await;

    let logs = phone.host.logs.lock().unwrap().clone();
    assert!(!logs.is_empty(), "the ended session is logged");
    for line in logs {
        assert!(
            !line.contains(MARKER),
            "a log line holds message text: {line}"
        );
    }
}
