//! One pairing over the network, against a fake host on loopback that
//! speaks the pairing handshake with `snow`.

mod support;

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use halonic_tunnel::{
    ConnectError, Dialer, Endpoint, FrameKind, PairRefusedReason, PairingAtCheck, PairingCode,
    PairingOptions, PairingProblem, PairingRequest, PairingRoute, PhoneDetails, Platform,
    SessionError, Timeouts, check_code, frame, start_pairing,
};
use serde_json::json;
use snow::HandshakeState;
use support::{FakeHost, read_handshake, seal, write_handshake};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{WebSocketStream, accept_async};

type Server = WebSocketStream<TcpStream>;

const CODE: &str = "XX7A9Q36KFB3";
const OTHER_CODE: &str = "22222222222A";

const WAIT: Duration = Duration::from_secs(5);

const FAST: PairingOptions = PairingOptions {
    timeouts: Timeouts::TUNNEL,
    handshake_timeout: Duration::from_millis(300),
    allow_timeout: Duration::from_millis(300),
};

struct Gateway {
    listener: TcpListener,
    host: FakeHost,
}

impl Gateway {
    async fn start() -> Self {
        Self {
            listener: TcpListener::bind("127.0.0.1:0").await.unwrap(),
            host: FakeHost::new(),
        }
    }

    fn endpoint(&self) -> Endpoint {
        let port = self.listener.local_addr().unwrap().port();
        Endpoint::parse(&format!("tcp:127.0.0.1:{port}")).unwrap()
    }

    fn request(&self, route: PairingRoute) -> PairingRequest {
        PairingRequest {
            endpoint: self.endpoint(),
            code: PairingCode::parse(CODE).unwrap(),
            route,
            phone: PhoneDetails {
                name: "Pixel 9".to_owned(),
                platform: Platform::Android,
            },
        }
    }

    async fn accept(&self) -> Server {
        let (stream, _) = timeout(WAIT, self.listener.accept())
            .await
            .unwrap()
            .unwrap();
        timeout(WAIT, accept_async(stream)).await.unwrap().unwrap()
    }

    /// The host's side up to message 2: reads message 1, answers message 2.
    async fn answer_message_1(&self, server: &mut Server, code: &str) -> HandshakeState {
        let mut noise = self.host.pairing(code);
        let frame1 = binary(server).await;
        read_handshake(&mut noise, FrameKind::Pair1, &frame1).unwrap();
        let payload = json!({ "hostName": "Desk" }).to_string();
        let frame2 = write_handshake(&mut noise, FrameKind::Pair2, payload.as_bytes());
        send(server, frame2).await;
        noise
    }
}

async fn binary(server: &mut Server) -> Vec<u8> {
    match timeout(WAIT, server.next()).await.unwrap() {
        Some(Ok(Message::Binary(bytes))) => bytes.to_vec(),
        other => panic!("expected a binary frame, got {other:?}"),
    }
}

async fn send(server: &mut Server, bytes: Vec<u8>) {
    server.send(Message::Binary(bytes.into())).await.unwrap();
}

fn refusal(reason: u8, tries_left: u8) -> Vec<u8> {
    frame(FrameKind::PairRefused, &[reason, tries_left])
}

/// Pairs on the typed route up to the check code, with the host reading
/// message 3.
async fn at_check(gateway: &Gateway) -> (PairingAtCheck, Server, HandshakeState) {
    let request = gateway.request(PairingRoute::Typed);
    let phone = tokio::spawn(start_pairing(request, Dialer::without_tls(), FAST));
    let mut server = gateway.accept().await;
    let mut noise = gateway.answer_message_1(&mut server, CODE).await;
    let frame3 = binary(&mut server).await;
    read_handshake(&mut noise, FrameKind::Pair3, &frame3).unwrap();
    let check = phone
        .await
        .unwrap()
        .expect("the pairing reaches the check code");
    (check, server, noise)
}

/// The host's encrypted answer after message 3.
async fn answer(server: &mut Server, noise: HandshakeState, message: serde_json::Value) {
    let mut session = noise.into_transport_mode().unwrap();
    let sealed = seal(
        &mut session,
        FrameKind::Message,
        message.to_string().as_bytes(),
    );
    send(server, sealed).await;
}

#[tokio::test]
async fn phone_pairing_ends_paired_with_the_host_key_and_a_new_phone_key() {
    let gateway = Gateway::start().await;
    let (check, mut server, noise) = at_check(&gateway).await;
    assert_eq!(check.host_name, "Desk");
    assert_eq!(check.check_code, check_code(noise.get_handshake_hash()));
    let phone_key: [u8; 32] = noise.get_remote_static().unwrap().try_into().unwrap();

    answer(&mut server, noise, json!({ "type": "paired" })).await;
    let paired = check.wait_for_allow().await.expect("paired");

    assert_eq!(paired.host_name, "Desk");
    assert_eq!(paired.host_key, gateway.host.public_key());
    assert_eq!(paired.keys.public(), &phone_key);
}

#[tokio::test]
async fn phone_pairing_reads_no_and_a_timeout_from_the_computer() {
    for (reason, problem) in [
        ("denied", PairingProblem::Denied),
        ("timed-out", PairingProblem::TimedOut),
    ] {
        let gateway = Gateway::start().await;
        let (check, mut server, noise) = at_check(&gateway).await;
        let message = json!({ "type": "pair-refused", "reason": reason });
        answer(&mut server, noise, message).await;
        assert_eq!(check.wait_for_allow().await.err(), Some(problem));
    }
}

#[tokio::test]
async fn phone_pairing_reads_any_other_answer_as_unreadable() {
    let gateway = Gateway::start().await;
    let (check, mut server, noise) = at_check(&gateway).await;
    answer(&mut server, noise, json!({ "type": "welcome" })).await;
    assert_eq!(
        check.wait_for_allow().await.err(),
        Some(PairingProblem::Session(SessionError::Unreadable))
    );
}

#[tokio::test]
async fn phone_pairing_learns_of_a_wrong_code_after_the_check_code() {
    let gateway = Gateway::start().await;
    let request = gateway.request(PairingRoute::Typed);
    let phone = tokio::spawn(start_pairing(request, Dialer::without_tls(), FAST));
    let mut server = gateway.accept().await;
    let mut noise = gateway.answer_message_1(&mut server, OTHER_CODE).await;
    let frame3 = binary(&mut server).await;
    assert!(read_handshake(&mut noise, FrameKind::Pair3, &frame3).is_err());
    let check = phone.await.unwrap().expect("the check code shows");

    send(&mut server, refusal(0, 4)).await;

    assert_eq!(
        check.wait_for_allow().await.err(),
        Some(PairingProblem::Session(SessionError::PairRefused {
            reason: PairRefusedReason::WrongCode,
            tries_left: 4,
        }))
    );
}

#[tokio::test]
async fn phone_pairing_reads_a_refusal_of_message_1() {
    let gateway = Gateway::start().await;
    let request = gateway.request(PairingRoute::Typed);
    let phone = tokio::spawn(start_pairing(request, Dialer::without_tls(), FAST));
    let mut server = gateway.accept().await;
    binary(&mut server).await;
    send(&mut server, refusal(3, 0)).await;

    assert_eq!(
        phone.await.unwrap().err(),
        Some(PairingProblem::Session(SessionError::PairRefused {
            reason: PairRefusedReason::RateLimited,
            tries_left: 0,
        }))
    );
}

#[tokio::test]
async fn phone_pairing_sends_no_message_3_to_a_computer_that_is_not_the_qr_codes() {
    let gateway = Gateway::start().await;
    let route = PairingRoute::Qr {
        host_key: FakeHost::new().public_key(),
    };
    let phone = tokio::spawn(start_pairing(
        gateway.request(route),
        Dialer::without_tls(),
        FAST,
    ));
    let mut server = gateway.accept().await;
    gateway.answer_message_1(&mut server, CODE).await;

    assert_eq!(
        phone.await.unwrap().err(),
        Some(PairingProblem::Session(SessionError::CantConfirm))
    );
    // The connection closes without a message 3.
    let next = timeout(WAIT, server.next()).await.unwrap();
    assert!(!matches!(next, Some(Ok(Message::Binary(_)))));
}

#[tokio::test]
async fn phone_pairing_times_out_when_the_computer_never_answers() {
    let gateway = Gateway::start().await;
    let (check, _server, _noise) = at_check(&gateway).await;
    assert_eq!(
        check.wait_for_allow().await.err(),
        Some(PairingProblem::TimedOut)
    );
}

#[tokio::test]
async fn phone_pairing_cannot_reach_a_computer_that_drops_the_connection() {
    let gateway = Gateway::start().await;
    let (check, server, _noise) = at_check(&gateway).await;
    drop(server);
    assert!(matches!(
        check.wait_for_allow().await.err(),
        Some(PairingProblem::CantReach(_))
    ));
}

#[tokio::test]
async fn phone_pairing_cannot_reach_a_computer_that_does_not_answer_message_1() {
    let gateway = Gateway::start().await;
    let request = gateway.request(PairingRoute::Typed);
    let phone = tokio::spawn(start_pairing(request, Dialer::without_tls(), FAST));
    let mut server = gateway.accept().await;
    binary(&mut server).await;

    assert_eq!(
        phone.await.unwrap().err(),
        Some(PairingProblem::CantReach(ConnectError::Timeout))
    );
}

#[tokio::test]
async fn phone_pairing_says_why_the_computer_could_not_be_reached() {
    let gateway = Gateway::start().await;
    let request = gateway.request(PairingRoute::Typed);
    drop(gateway);
    let problem = start_pairing(request, Dialer::without_tls(), FAST)
        .await
        .err();
    assert_eq!(
        problem,
        Some(PairingProblem::CantReach(ConnectError::Refused))
    );
}
