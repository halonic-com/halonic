//! Connections to paired computers, through the service, against a fake
//! computer: the statuses the page is told, and what the paired-computer
//! list keeps.

mod common;

use std::time::Duration;

use common::support::seal;
use common::{Gateway, NOW_MS, Phone, closed, send};
use halonic_device_keys::{ComputerId, DeviceKeyStore, Standing};
use halonic_phone_tunnel::{
    ComputersAnswer, ConnectOutcome, ForgetOutcome, LocalNetwork, PageStatus, Problem, Reason,
    StandingView,
};
use halonic_tunnel::FrameKind;
use tokio::time::timeout;

#[tokio::test]
async fn phone_tunnel_connections_wipe_the_key_before_saying_removed() {
    let mut phone = Phone::new("connections-removed", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let id = phone.pair(&gateway).await;
    let computer = ComputerId::parse(&id).unwrap();

    let (outcome, mut server) = tokio::join!(phone.tunnel.connect(&id), gateway.accept());
    assert_eq!(outcome, ConnectOutcome::Connecting);
    assert_eq!(
        phone.next_status().await,
        (id.clone(), PageStatus::Connecting)
    );
    let mut session = gateway.reconnect(&mut server).await;
    let not_paired = seal(
        &mut session,
        FrameKind::Message,
        br#"{"type":"not-paired"}"#,
    );
    send(&mut server, not_paired).await;

    phone.until_status(&id, PageStatus::Removed).await;
    // By the time the page hears of it, the key and the pin are gone.
    let list = phone.list();
    assert!(list.keys().load(&computer).unwrap().is_none());
    let details = list.details(&computer).unwrap().expect("still listed");
    assert_eq!(details.standing, Standing::Removed);
    let ComputersAnswer::Computers(listed) = phone.tunnel.computers().await else {
        panic!("the list reads");
    };
    assert_eq!(listed[0].standing, StandingView::Removed);
    assert_eq!(
        phone.tunnel.connect(&id).await,
        ConnectOutcome::Stopped(Problem::NotPaired)
    );
}

#[tokio::test]
async fn phone_tunnel_connections_keep_the_key_when_they_cant_confirm() {
    let mut phone = Phone::new("connections-cant-confirm", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let id = phone.pair(&gateway).await;
    let computer = ComputerId::parse(&id).unwrap();

    let (_, mut server) = tokio::join!(phone.tunnel.connect(&id), gateway.accept());
    common::binary(&mut server).await;
    send(&mut server, vec![0x30]).await;

    phone.until_status(&id, PageStatus::CantConfirm).await;
    let list = phone.list();
    assert!(list.keys().load(&computer).unwrap().is_some());
    let details = list.details(&computer).unwrap().expect("listed");
    assert!(matches!(details.standing, Standing::CantConfirm { .. }));
    phone.tunnel.disconnect(&id);
}

#[tokio::test]
async fn phone_tunnel_connections_say_when_the_next_try_starts() {
    let mut phone = Phone::new("connections-next-try", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let id = phone.pair(&gateway).await;

    let (_, mut server) = tokio::join!(phone.tunnel.connect(&id), gateway.accept());
    gateway.reconnect(&mut server).await;
    drop(server);

    phone
        .until_status(
            &id,
            PageStatus::Reconnecting {
                last_try: None,
                next_try_at_ms: None,
            },
        )
        .await;
    let (_, status) = phone.next_status().await;
    let PageStatus::Reconnecting {
        next_try_at_ms: Some(at_ms),
        ..
    } = status
    else {
        panic!("the time of the next try, not {status:?}");
    };
    // The test backoff waits 20 ms ±20 % first.
    assert!((NOW_MS + 16..=NOW_MS + 24).contains(&at_ms), "{at_ms}");
    phone.tunnel.disconnect(&id);
}

#[tokio::test]
async fn phone_tunnel_connections_open_one_connection_per_computer() {
    let mut phone = Phone::new("connections-once", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let id = phone.pair(&gateway).await;

    let (outcome, mut server) = tokio::join!(phone.tunnel.connect(&id), gateway.accept());
    assert_eq!(outcome, ConnectOutcome::Connecting);
    gateway.reconnect(&mut server).await;
    assert_eq!(phone.tunnel.connect(&id).await, ConnectOutcome::Connecting);
    assert!(
        timeout(Duration::from_millis(300), gateway.listener.accept())
            .await
            .is_err(),
        "no second connection"
    );
    phone.tunnel.disconnect(&id);
    phone.until_status(&id, PageStatus::Closed).await;
}

#[tokio::test]
async fn phone_tunnel_connections_disconnect_and_say_closed() {
    let mut phone = Phone::new("connections-closed", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let id = phone.pair(&gateway).await;

    let (_, mut server) = tokio::join!(phone.tunnel.connect(&id), gateway.accept());
    phone.tunnel.disconnect(&id);
    phone.until_status(&id, PageStatus::Closed).await;
    assert!(closed(&mut server).await, "the connection ends");
    assert!(
        phone
            .tunnel
            .statuses()
            .contains(&(ComputerId::parse(&id).unwrap(), PageStatus::Closed))
    );
}

#[tokio::test]
async fn phone_tunnel_connections_forget_wipes_the_key_and_the_details() {
    let phone = Phone::new("connections-forget", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let id = phone.pair(&gateway).await;
    let computer = ComputerId::parse(&id).unwrap();

    let (_, mut server) = tokio::join!(phone.tunnel.connect(&id), gateway.accept());
    assert_eq!(phone.tunnel.forget(&id).await, ForgetOutcome::Forgotten);
    assert!(closed(&mut server).await, "the connection ends");
    let list = phone.list();
    assert!(list.keys().load(&computer).unwrap().is_none());
    assert!(list.details(&computer).unwrap().is_none());
    assert_eq!(
        phone.tunnel.computers().await,
        ComputersAnswer::Computers(Vec::new())
    );
    assert!(phone.tunnel.statuses().is_empty());
}

#[tokio::test]
async fn phone_tunnel_connections_need_a_listed_computer() {
    let phone = Phone::new("connections-not-listed", LocalNetwork::Allowed);
    for computer in ["desk", "../desk", ""] {
        assert_eq!(
            phone.tunnel.connect(computer).await,
            ConnectOutcome::Stopped(Problem::NotPaired),
            "{computer}"
        );
    }
}

#[tokio::test]
async fn phone_tunnel_connections_say_why_the_computer_could_not_be_reached() {
    let mut phone = Phone::new("connections-cant-reach", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let id = phone.pair(&gateway).await;
    drop(gateway);
    assert_eq!(
        phone.tunnel.connect(&id).await,
        ConnectOutcome::Stopped(Problem::CantReach {
            reason: Reason::Refused
        })
    );
    assert!(phone.no_status().await, "nothing ran, so no status");
}
