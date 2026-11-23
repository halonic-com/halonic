//! The page's gateway messages, sent through the service to a fake
//! computer (requirement `phone-tunnel-messages`; B7 items 1, 2, 6 and 7 of
//! the D7 design on HAL-15159). The fake records every frame the phone
//! writes, so a message that was refused, or meant for an earlier session,
//! would show up there.

mod common;

use common::support::{open, seal};
use common::{Gateway, HELLO, Phone, binary, closed, connected, next_message, send};
use halonic_phone_tunnel::{
    ForgetOutcome, GATEWAY_MAX_MESSAGE_BYTES, LocalNetwork, PageStatus, SendRefusal,
};
use halonic_tunnel::FrameKind;

#[tokio::test]
async fn phone_tunnel_messages_send_nothing_before_the_session_opens() {
    let mut phone = Phone::new("messages-before-session", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let id = phone.pair(&gateway).await;
    let (_, mut server) = tokio::join!(phone.tunnel.connect(&id), gateway.accept());

    // Connected, but the reconnect handshake hasn't finished.
    for generation in [0, 1, 2] {
        assert_eq!(
            phone.tunnel.send(&id, generation, HELLO).await,
            Err(SendRefusal::NotOpen)
        );
    }
    let mut session = gateway.reconnect(&mut server).await;
    let generation = phone.session_opened(&id).await;
    phone.tunnel.send(&id, generation, HELLO).await.unwrap();

    // The first frame after the handshake is the message sent after it.
    assert_eq!(next_message(&mut server, &mut session).await, HELLO);
}

#[tokio::test]
async fn phone_tunnel_messages_send_nothing_in_the_clear() {
    let mut phone = Phone::new("messages-clear", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (id, mut server, mut session, generation) = connected(&mut phone, &gateway).await;
    let sent = [
        r#"{"type":"list-sessions","id":"l-marker-5e1f"}"#,
        r#"{"type":"prompt","id":"p1","sessionId":"s1","text":"marker-5e1f"}"#,
    ];

    for text in sent {
        phone.tunnel.send(&id, generation, text).await.unwrap();
        let frame = binary(&mut server).await;
        let raw = String::from_utf8_lossy(&frame);
        assert!(!raw.contains("marker-5e1f"), "a frame holds the text");
        assert!(!raw.contains("list-sessions") && !raw.contains("prompt"));
        let (kind, message) = open(&mut session, &frame);
        assert_eq!(kind, FrameKind::Message);
        assert_eq!(message, text.as_bytes());
    }
}

#[tokio::test]
async fn phone_tunnel_messages_refuse_before_sealing_and_keep_the_session() {
    let mut phone = Phone::new("messages-refused", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (id, mut server, mut session, generation) = connected(&mut phone, &gateway).await;
    let too_large = format!(
        r#"{{"type":"prompt","text":"{}"}}"#,
        "a".repeat(GATEWAY_MAX_MESSAGE_BYTES)
    );
    let id = id.as_str();
    let refused = [
        (
            id,
            generation,
            r#"{"type":"run-command"}"#,
            SendRefusal::NotAllowed,
        ),
        (
            id,
            generation,
            r#"{"type":"welcome"}"#,
            SendRefusal::NotAllowed,
        ),
        (
            id,
            generation,
            r#"{"type":"hello"}{"type":"hello"}"#,
            SendRefusal::NotAllowed,
        ),
        (
            id,
            generation,
            r#"{"type":"hello","type":"prompt"}"#,
            SendRefusal::NotAllowed,
        ),
        (id, generation, too_large.as_str(), SendRefusal::TooLarge),
        (id, generation + 1, HELLO, SendRefusal::NotOpen),
        (id, generation - 1, HELLO, SendRefusal::NotOpen),
        ("another-computer", generation, HELLO, SendRefusal::NotOpen),
    ];
    for (computer, generation, text, refusal) in refused {
        assert_eq!(
            phone.tunnel.send(computer, generation, text).await,
            Err(refusal)
        );
    }

    // Nothing went out, and the session is still open.
    phone.tunnel.send(id, generation, HELLO).await.unwrap();
    assert_eq!(next_message(&mut server, &mut session).await, HELLO);
}

#[tokio::test]
async fn phone_tunnel_messages_go_only_into_their_computers_session() {
    let mut phone = Phone::new("messages-two-computers", LocalNetwork::Allowed);
    let desk = Gateway::start().await;
    let laptop = Gateway::start().await;
    let (desk_id, mut desk_server, mut desk_session, desk_generation) =
        connected(&mut phone, &desk).await;
    let laptop_id = phone.pair(&laptop).await;

    // The laptop has no session; the desk's generation doesn't open one.
    assert_eq!(
        phone.tunnel.send(&laptop_id, desk_generation, HELLO).await,
        Err(SendRefusal::NotOpen)
    );
    let (_, mut laptop_server) = tokio::join!(phone.tunnel.connect(&laptop_id), laptop.accept());
    let mut laptop_session = laptop.reconnect(&mut laptop_server).await;
    let laptop_generation = phone.session_opened(&laptop_id).await;
    assert!(
        laptop_generation > desk_generation,
        "generations go up across computers"
    );
    assert_eq!(
        phone.tunnel.send(&desk_id, laptop_generation, HELLO).await,
        Err(SendRefusal::NotOpen)
    );

    phone
        .tunnel
        .send(&laptop_id, laptop_generation, HELLO)
        .await
        .unwrap();
    phone
        .tunnel
        .send(&desk_id, desk_generation, HELLO)
        .await
        .unwrap();
    assert_eq!(
        next_message(&mut laptop_server, &mut laptop_session).await,
        HELLO
    );
    assert_eq!(
        next_message(&mut desk_server, &mut desk_session).await,
        HELLO
    );
}

#[tokio::test]
async fn phone_tunnel_messages_never_queue_or_resend_across_a_reconnect() {
    let mut phone = Phone::new("messages-reconnect", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (id, mut server, mut session, first) = connected(&mut phone, &gateway).await;
    let before = r#"{"type":"prompt","id":"p1","sessionId":"s1","text":"before"}"#;
    let during = r#"{"type":"prompt","id":"p2","sessionId":"s1","text":"during"}"#;
    let after = r#"{"type":"prompt","id":"p3","sessionId":"s1","text":"after"}"#;

    phone.tunnel.send(&id, first, before).await.unwrap();
    assert_eq!(next_message(&mut server, &mut session).await, before);
    drop(server);
    loop {
        let (_, status) = phone.next_status().await;
        if matches!(status, PageStatus::Reconnecting { .. }) {
            break;
        }
    }
    assert_eq!(
        phone.tunnel.send(&id, first, during).await,
        Err(SendRefusal::NotOpen)
    );

    let mut again = gateway.accept().await;
    let mut session = gateway.reconnect(&mut again).await;
    let second = phone.session_opened(&id).await;
    assert!(second > first);
    assert_eq!(
        phone.tunnel.send(&id, first, during).await,
        Err(SendRefusal::NotOpen)
    );
    phone.tunnel.send(&id, second, after).await.unwrap();
    // Neither the message from before the drop nor the one refused during
    // it comes again: the new connection's first message is the new one.
    assert_eq!(next_message(&mut again, &mut session).await, after);
}

#[tokio::test]
async fn phone_tunnel_messages_refuse_after_removed_or_forget() {
    let mut phone = Phone::new("messages-removed", LocalNetwork::Allowed);
    let desk = Gateway::start().await;
    let laptop = Gateway::start().await;
    let (desk_id, mut desk_server, mut desk_session, desk_generation) =
        connected(&mut phone, &desk).await;
    let (laptop_id, mut laptop_server, _, laptop_generation) = connected(&mut phone, &laptop).await;

    let not_paired = seal(
        &mut desk_session,
        FrameKind::Message,
        br#"{"type":"not-paired"}"#,
    );
    send(&mut desk_server, not_paired).await;
    phone.until_status(&desk_id, PageStatus::Removed).await;
    assert_eq!(
        phone.tunnel.send(&desk_id, desk_generation, HELLO).await,
        Err(SendRefusal::NotOpen)
    );

    assert_eq!(
        phone.tunnel.forget(&laptop_id).await,
        ForgetOutcome::Forgotten
    );
    assert_eq!(
        phone
            .tunnel
            .send(&laptop_id, laptop_generation, HELLO)
            .await,
        Err(SendRefusal::NotOpen)
    );
    assert!(closed(&mut laptop_server).await);
}
