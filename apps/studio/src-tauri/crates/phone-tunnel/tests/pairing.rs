//! One pairing at a time, through the service, against a fake computer.

mod common;

use std::sync::atomic::Ordering;

use common::support::{FakeHost, read_handshake};
use common::{CODE, Gateway, NOW_MS, OTHER_CODE, Phone, binary, closed, send, start};
use halonic_blob_store::base64url;
use halonic_device_keys::{ComputerId, DeviceKeyStore};
use halonic_phone_tunnel::{
    ComputerView, ComputersAnswer, LocalNetwork, PairingOutcome, PairingStep, Problem, StandingView,
};
use halonic_tunnel::{FrameKind, check_code, frame};
use serde_json::json;

#[tokio::test]
async fn phone_tunnel_pairing_lists_the_computer_once_allowed() {
    let phone = Phone::new("pairing-allowed", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (step, (server, noise)) = tokio::join!(
        phone.tunnel.pair_start(gateway.typed_start()),
        gateway.run_to_message_3(CODE)
    );
    assert_eq!(
        step,
        PairingStep::Check {
            computer_name: "Desk".to_owned(),
            check_code: check_code(noise.get_handshake_hash()).as_str().to_owned(),
        }
    );
    let phone_key: [u8; 32] = noise.get_remote_static().unwrap().try_into().unwrap();

    let (outcome, ()) = tokio::join!(
        phone.tunnel.pair_wait(),
        gateway.answer_paired(server, noise)
    );
    let listed = ComputerView {
        id: ComputerId::for_host_key(&gateway.host.public_key())
            .as_str()
            .to_owned(),
        standing: StandingView::Paired,
        name: Some("Desk".to_owned()),
        endpoints: vec![gateway.endpoint()],
        paired_at_ms: Some(NOW_MS),
        last_connected_at_ms: None,
    };
    assert_eq!(outcome, PairingOutcome::Paired(listed.clone()));
    assert_eq!(
        phone.tunnel.computers().await,
        ComputersAnswer::Computers(vec![listed.clone()])
    );
    let id = ComputerId::parse(&listed.id).unwrap();
    let kept = phone.list().keys().load(&id).unwrap().expect("the key");
    assert_eq!(kept.public, phone_key);
    // Loopback needs no local network question.
    assert_eq!(phone.host.asked.load(Ordering::Relaxed), 0);
}

#[tokio::test]
async fn phone_tunnel_pairing_stops_when_the_qr_key_is_not_the_computer_s() {
    let phone = Phone::new("pairing-other-key", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let qr = start(json!({
        "route": "qr",
        "hostKey": base64url::encode(&FakeHost::new().public_key()),
        "code": CODE,
        "endpoints": [gateway.endpoint()],
    }));
    let host_side = async {
        let mut server = gateway.accept().await;
        let mut noise = gateway.host.pairing(CODE);
        read_handshake(&mut noise, FrameKind::Pair1, &binary(&mut server).await).unwrap();
        let frame2 = common::support::write_handshake(
            &mut noise,
            FrameKind::Pair2,
            br#"{"hostName":"Desk"}"#,
        );
        send(&mut server, frame2).await;
        server
    };
    let (step, mut server) = tokio::join!(phone.tunnel.pair_start(qr), host_side);
    assert_eq!(step, PairingStep::Stopped(Problem::HandshakeFailed));
    assert!(
        closed(&mut server).await,
        "no message 3, and the connection ends"
    );
}

#[tokio::test]
async fn phone_tunnel_pairing_learns_of_a_wrong_code_after_the_check_code() {
    let phone = Phone::new("pairing-wrong-code", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (step, (mut server, _noise)) = tokio::join!(
        phone.tunnel.pair_start(gateway.typed_start()),
        gateway.run_to_message_3(OTHER_CODE)
    );
    assert!(matches!(step, PairingStep::Check { .. }), "{step:?}");
    send(&mut server, frame(FrameKind::PairRefused, &[0, 4])).await;
    assert_eq!(
        phone.tunnel.pair_wait().await,
        PairingOutcome::Stopped(Problem::WrongCode { tries_left: 4 })
    );
    assert_eq!(
        phone.tunnel.computers().await,
        ComputersAnswer::Computers(Vec::new())
    );
}

#[tokio::test]
async fn phone_tunnel_pairing_cancel_ends_the_wait_and_the_connection() {
    let phone = Phone::new("pairing-cancel", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (step, (mut server, _noise)) = tokio::join!(
        phone.tunnel.pair_start(gateway.typed_start()),
        gateway.run_to_message_3(CODE)
    );
    assert!(matches!(step, PairingStep::Check { .. }), "{step:?}");
    let (outcome, ()) = tokio::join!(phone.tunnel.pair_wait(), async {
        tokio::task::yield_now().await;
        phone.tunnel.pair_cancel();
    });
    assert_eq!(outcome, PairingOutcome::Stopped(Problem::CodeEnded));
    assert!(
        closed(&mut server).await,
        "the computer sees the pairing end"
    );
    // Nothing is left to wait for.
    assert_eq!(
        phone.tunnel.pair_wait().await,
        PairingOutcome::Stopped(Problem::CodeEnded)
    );
}

#[tokio::test]
async fn phone_tunnel_pairing_a_new_start_ends_the_earlier_one() {
    let phone = Phone::new("pairing-replaced", LocalNetwork::Allowed);
    let first = Gateway::start().await;
    let second = Gateway::start().await;
    let (step, (mut first_server, _noise)) = tokio::join!(
        phone.tunnel.pair_start(first.typed_start()),
        first.run_to_message_3(CODE)
    );
    assert!(matches!(step, PairingStep::Check { .. }), "{step:?}");
    let (step, (server, noise)) = tokio::join!(
        phone.tunnel.pair_start(second.typed_start()),
        second.run_to_message_3(CODE)
    );
    assert!(matches!(step, PairingStep::Check { .. }), "{step:?}");
    assert!(closed(&mut first_server).await, "the first pairing ended");
    let (outcome, ()) = tokio::join!(
        phone.tunnel.pair_wait(),
        second.answer_paired(server, noise)
    );
    assert!(matches!(outcome, PairingOutcome::Paired(_)), "{outcome:?}");
}

#[tokio::test]
async fn phone_tunnel_pairing_asks_for_the_local_network_before_the_wi_fi() {
    let phone = Phone::new(
        "pairing-local-network",
        LocalNetwork::TurnedDown { ask_again: true },
    );
    let typed = start(json!({
        "route": "typed",
        "code": CODE,
        "endpoints": ["tcp://192.168.1.20:4100"],
    }));
    assert_eq!(
        phone.tunnel.pair_start(typed).await,
        PairingStep::Stopped(Problem::NoLocalNetwork { ask_again: true })
    );
    assert_eq!(phone.host.asked.load(Ordering::Relaxed), 1);
}

#[tokio::test]
async fn phone_tunnel_pairing_says_why_the_computer_could_not_be_reached() {
    let phone = Phone::new("pairing-cant-reach", LocalNetwork::Allowed);
    let gone = Gateway::start().await;
    let typed = gone.typed_start();
    drop(gone);
    assert_eq!(
        phone.tunnel.pair_start(typed).await,
        PairingStep::Stopped(Problem::CantReach {
            reason: halonic_phone_tunnel::Reason::Refused
        })
    );
    assert_eq!(
        phone.tunnel.pair_wait().await,
        PairingOutcome::Stopped(Problem::CodeEnded)
    );
}

#[tokio::test]
async fn phone_tunnel_pairing_again_keeps_the_id_and_ends_the_earlier_connection() {
    let phone = Phone::new("pairing-again", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let id = phone.pair(&gateway).await;
    let computer = ComputerId::parse(&id).unwrap();
    let earlier_key = phone.list().keys().load(&computer).unwrap().unwrap().public;
    let (_, mut earlier) = tokio::join!(phone.tunnel.connect(&id), gateway.accept());
    gateway.reconnect(&mut earlier).await;

    // The computer was set up again, with a new key and a new address, and
    // the person chose Pair again on it.
    let moved = Gateway::start().await;
    let again = start(json!({
        "route": "typed",
        "code": CODE,
        "endpoints": [moved.endpoint()],
        "again": id,
    }));
    assert_eq!(phone.pair_from(&moved, again).await, id);

    assert!(closed(&mut earlier).await, "the earlier connection ends");
    let list = phone.list();
    let kept = list.keys().load(&computer).unwrap().expect("a key");
    assert_ne!(kept.public, earlier_key);
    let details = list.details(&computer).unwrap().expect("listed");
    assert_eq!(details.standing.host_key(), Some(&moved.host.public_key()));
    assert_eq!(details.endpoints, [moved.endpoint(), gateway.endpoint()]);
    let ComputersAnswer::Computers(listed) = phone.tunnel.computers().await else {
        panic!("the list reads");
    };
    assert_eq!(listed.len(), 1, "listed once");
}
