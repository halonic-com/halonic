//! `Session` against plain `snow`, set up as the phone sets it up, both
//! ways round; then the misuse that must fail the session for good
//! (Julian's test plan on HAL-12355).

mod common;

use common::{NoRandom, SeededRandom};
use halonic_e2e_noise_wasm::{
    Failure, Handshake, MAX_MESSAGE_BYTES, Role, Session, SessionKeys, TAG_BYTES,
};
use snow::{Builder, HandshakeState, TransportState};

const PROLOGUE: &[u8] = b"halonic-gateway/2";
const PSK: [u8; 32] = [7; 32];

fn snow_builder<'a>(handshake: Handshake, seed: u64) -> Builder<'a> {
    common::snow_builder(handshake.protocol_name(), seed)
}

struct Keypair {
    private: [u8; 32],
    public: [u8; 32],
}

fn keypair(seed: u64) -> Keypair {
    let pair = snow_builder(Handshake::Reconnect, seed)
        .generate_keypair()
        .expect("keypair");
    Keypair {
        private: pair.private.try_into().expect("32 bytes"),
        public: pair.public.try_into().expect("32 bytes"),
    }
}

/// One end of a session, ours or plain `snow`'s.
trait Party {
    fn write(&mut self, payload: &[u8]) -> Result<Vec<u8>, String>;
    fn read(&mut self, message: &[u8]) -> Result<Vec<u8>, String>;
    fn handshake_hash(&self) -> Vec<u8>;
    fn remote_static(&self) -> Vec<u8>;
    fn rekey_outgoing(&mut self);
    fn rekey_incoming(&mut self);
}

impl Party for Session {
    fn write(&mut self, payload: &[u8]) -> Result<Vec<u8>, String> {
        let mut out = vec![0; MAX_MESSAGE_BYTES];
        let length =
            Session::write(self, payload, &mut out).map_err(|failure| format!("{failure:?}"))?;
        Ok(out[..length].to_vec())
    }
    fn read(&mut self, message: &[u8]) -> Result<Vec<u8>, String> {
        let mut out = vec![0; MAX_MESSAGE_BYTES];
        let length =
            Session::read(self, message, &mut out).map_err(|failure| format!("{failure:?}"))?;
        Ok(out[..length].to_vec())
    }
    fn handshake_hash(&self) -> Vec<u8> {
        Session::handshake_hash(self).expect("hash").to_vec()
    }
    fn remote_static(&self) -> Vec<u8> {
        Session::remote_static(self)
            .expect("remote static")
            .to_vec()
    }
    fn rekey_outgoing(&mut self) {
        Session::rekey_outgoing(self).expect("rekey");
    }
    fn rekey_incoming(&mut self) {
        Session::rekey_incoming(self).expect("rekey");
    }
}

/// Plain `snow`: a handshake, then transport, keeping the handshake hash.
struct Snow {
    handshake: Option<HandshakeState>,
    transport: Option<TransportState>,
    hash: Vec<u8>,
}

impl Snow {
    fn new(handshake: HandshakeState) -> Self {
        Snow {
            handshake: Some(handshake),
            transport: None,
            hash: Vec::new(),
        }
    }

    fn after_message(&mut self) {
        if self
            .handshake
            .as_ref()
            .is_some_and(HandshakeState::is_handshake_finished)
        {
            let handshake = self.handshake.take().expect("handshake");
            self.hash = handshake.get_handshake_hash().to_vec();
            self.transport = Some(handshake.into_transport_mode().expect("transport"));
        }
    }

    fn transport(&mut self) -> &mut TransportState {
        self.transport.as_mut().expect("transport")
    }
}

impl Party for Snow {
    fn write(&mut self, payload: &[u8]) -> Result<Vec<u8>, String> {
        let mut out = vec![0; MAX_MESSAGE_BYTES];
        let length = match (&mut self.handshake, &mut self.transport) {
            (Some(handshake), _) => handshake.write_message(payload, &mut out),
            (None, Some(transport)) => transport.write_message(payload, &mut out),
            _ => unreachable!(),
        }
        .map_err(|error| error.to_string())?;
        self.after_message();
        Ok(out[..length].to_vec())
    }
    fn read(&mut self, message: &[u8]) -> Result<Vec<u8>, String> {
        let mut out = vec![0; MAX_MESSAGE_BYTES];
        let length = match (&mut self.handshake, &mut self.transport) {
            (Some(handshake), _) => handshake.read_message(message, &mut out),
            (None, Some(transport)) => transport.read_message(message, &mut out),
            _ => unreachable!(),
        }
        .map_err(|error| error.to_string())?;
        self.after_message();
        Ok(out[..length].to_vec())
    }
    fn handshake_hash(&self) -> Vec<u8> {
        self.hash.clone()
    }
    fn remote_static(&self) -> Vec<u8> {
        self.transport
            .as_ref()
            .and_then(TransportState::get_remote_static)
            .expect("remote static")
            .to_vec()
    }
    fn rekey_outgoing(&mut self) {
        self.transport().rekey_outgoing();
    }
    fn rekey_incoming(&mut self) {
        self.transport().rekey_incoming();
    }
}

/// Sends `payload` from one party to the other and checks it arrives.
fn send(from: &mut dyn Party, to: &mut dyn Party, payload: &[u8]) {
    let message = from.write(payload).expect("write");
    assert_eq!(to.read(&message).expect("read"), payload);
}

/// Our session with these keys, as `role`.
fn ours(
    handshake: Handshake,
    role: Role,
    local: &Keypair,
    remote: Option<&Keypair>,
    seed: u64,
) -> Session {
    let keys = SessionKeys {
        local_private: &local.private,
        remote_public: remote.map(|remote| &remote.public),
        psk: (handshake == Handshake::Pairing).then_some(&PSK),
        prologue: PROLOGUE,
    };
    Session::start(handshake, role, &keys, Box::new(SeededRandom(seed))).expect("start")
}

/// Plain `snow` with these keys, as `role`.
fn theirs(
    handshake: Handshake,
    role: Role,
    local: &Keypair,
    remote: Option<&Keypair>,
    seed: u64,
) -> Snow {
    let mut builder = snow_builder(handshake, seed)
        .local_private_key(&local.private)
        .and_then(|builder| builder.prologue(PROLOGUE))
        .expect("builder");
    if let Some(remote) = remote {
        builder = builder
            .remote_public_key(&remote.public)
            .expect("remote key");
    }
    if handshake == Handshake::Pairing {
        builder = builder.psk(3, &PSK).expect("psk");
    }
    let state = match role {
        Role::Initiator => builder.build_initiator(),
        Role::Responder => builder.build_responder(),
    };
    Snow::new(state.expect("build"))
}

/// Runs a whole session between `initiator` and `responder`: the handshake,
/// messages both ways, and a rekey of each direction.
fn run_session(initiator: &mut dyn Party, responder: &mut dyn Party, handshake_messages: usize) {
    for index in 0..handshake_messages {
        let payload = format!("handshake {index}").into_bytes();
        if index.is_multiple_of(2) {
            send(initiator, responder, &payload);
        } else {
            send(responder, initiator, &payload);
        }
    }
    assert_eq!(initiator.handshake_hash(), responder.handshake_hash());
    assert_eq!(initiator.handshake_hash().len(), 32);
    send(initiator, responder, b"to the responder");
    send(responder, initiator, b"to the initiator");
    rekey(initiator, responder);
    rekey(responder, initiator);
    send(initiator, responder, b"after both rekeys");
    send(responder, initiator, b"after both rekeys, back");
}

/// Rekeys the direction from `from` to `to`, as a `rekey` frame does.
fn rekey(from: &mut dyn Party, to: &mut dyn Party) {
    send(from, to, b"the last message under the old key");
    from.rekey_outgoing();
    to.rekey_incoming();
    send(from, to, b"the first message under the new key");
}

#[test]
fn pairing_works_with_plain_snow_both_ways_round() {
    let (host, phone) = (keypair(1), keypair(2));
    let mut host_session = ours(Handshake::Pairing, Role::Responder, &host, None, 3);
    let mut phone_snow = theirs(Handshake::Pairing, Role::Initiator, &phone, None, 4);
    run_session(&mut phone_snow, &mut host_session, 3);
    assert_eq!(Party::remote_static(&host_session), phone.public);
    assert_eq!(phone_snow.remote_static(), host.public);

    let mut initiator = ours(Handshake::Pairing, Role::Initiator, &phone, None, 5);
    let mut responder = theirs(Handshake::Pairing, Role::Responder, &host, None, 6);
    run_session(&mut initiator, &mut responder, 3);
}

#[test]
fn reconnect_works_with_plain_snow_both_ways_round() {
    let (host, phone) = (keypair(1), keypair(2));
    let mut host_session = ours(Handshake::Reconnect, Role::Responder, &host, None, 3);
    let mut phone_snow = theirs(
        Handshake::Reconnect,
        Role::Initiator,
        &phone,
        Some(&host),
        4,
    );
    run_session(&mut phone_snow, &mut host_session, 2);
    assert_eq!(Party::remote_static(&host_session), phone.public);

    let mut initiator = ours(
        Handshake::Reconnect,
        Role::Initiator,
        &phone,
        Some(&host),
        5,
    );
    let mut responder = theirs(Handshake::Reconnect, Role::Responder, &host, None, 6);
    run_session(&mut initiator, &mut responder, 2);
    assert_eq!(responder.remote_static(), phone.public);
}

#[test]
fn a_wrong_psk_fails_the_handshake_and_the_session_stays_failed() {
    let (host, phone) = (keypair(1), keypair(2));
    let mut host_session = ours(Handshake::Pairing, Role::Responder, &host, None, 3);
    let mut phone_snow = theirs(Handshake::Pairing, Role::Initiator, &phone, None, 4);
    phone_snow
        .handshake
        .as_mut()
        .expect("handshake")
        .set_psk(3, &[8; 32])
        .expect("psk");
    send(&mut phone_snow, &mut host_session, b"");
    send(&mut host_session, &mut phone_snow, b"");
    let message3 = phone_snow.write(b"").expect("write");
    let mut out = vec![0; MAX_MESSAGE_BYTES];
    assert_eq!(host_session.read(&message3, &mut out), Err(Failure::Noise));
    assert_eq!(host_session.read(&message3, &mut out), Err(Failure::State));
    assert_eq!(host_session.handshake_hash(), Err(Failure::State));
}

/// Our host and plain `snow` as the phone, reconnected and ready for transport.
fn connected() -> (Session, Snow) {
    let (host, phone) = (keypair(1), keypair(2));
    let mut host_session = ours(Handshake::Reconnect, Role::Responder, &host, None, 3);
    let mut phone_snow = theirs(
        Handshake::Reconnect,
        Role::Initiator,
        &phone,
        Some(&host),
        4,
    );
    send(&mut phone_snow, &mut host_session, b"");
    send(&mut host_session, &mut phone_snow, b"");
    (host_session, phone_snow)
}

#[test]
fn writing_when_it_is_time_to_read_fails_the_session() {
    let host = keypair(1);
    let mut host_session = ours(Handshake::Pairing, Role::Responder, &host, None, 3);
    let mut out = vec![0; MAX_MESSAGE_BYTES];
    assert_eq!(host_session.write(b"", &mut out), Err(Failure::State));
    let mut phone_snow = theirs(Handshake::Pairing, Role::Initiator, &keypair(2), None, 4);
    let message1 = phone_snow.write(b"").expect("write");
    assert_eq!(host_session.read(&message1, &mut out), Err(Failure::State));
}

#[test]
fn reading_when_it_is_time_to_write_fails_the_session() {
    let mut initiator = ours(Handshake::Pairing, Role::Initiator, &keypair(2), None, 3);
    let mut out = vec![0; MAX_MESSAGE_BYTES];
    assert_eq!(initiator.read(&[0; 32], &mut out), Err(Failure::State));
    assert_eq!(initiator.write(b"", &mut out), Err(Failure::State));
}

#[test]
fn a_replayed_transport_message_fails_and_so_does_everything_after_it() {
    let (mut host_session, mut phone_snow) = connected();
    let first = phone_snow.write(b"once").expect("write");
    let second = phone_snow.write(b"twice").expect("write");
    let mut out = vec![0; MAX_MESSAGE_BYTES];
    assert!(host_session.read(&first, &mut out).is_ok());
    assert_eq!(host_session.read(&first, &mut out), Err(Failure::Noise));
    assert_eq!(host_session.read(&second, &mut out), Err(Failure::State));
}

#[test]
fn a_reordered_transport_message_fails() {
    let (mut host_session, mut phone_snow) = connected();
    let _first = phone_snow.write(b"first").expect("write");
    let second = phone_snow.write(b"second").expect("write");
    let mut out = vec![0; MAX_MESSAGE_BYTES];
    assert_eq!(host_session.read(&second, &mut out), Err(Failure::Noise));
}

#[test]
fn a_flipped_bit_fails() {
    let (mut host_session, mut phone_snow) = connected();
    let mut message = phone_snow.write(b"intact").expect("write");
    message[3] ^= 1;
    let mut out = vec![0; MAX_MESSAGE_BYTES];
    assert_eq!(host_session.read(&message, &mut out), Err(Failure::Noise));
}

#[test]
fn messages_from_empty_to_the_noise_maximum_go_through() {
    let (mut host_session, mut phone_snow) = connected();
    for length in [0, 1, MAX_MESSAGE_BYTES - TAG_BYTES] {
        let payload = vec![0x5a; length];
        send(&mut host_session, &mut phone_snow, &payload);
        send(&mut phone_snow, &mut host_session, &payload);
    }
}

#[test]
fn a_payload_one_byte_over_the_maximum_fails_the_session() {
    let (mut host_session, _) = connected();
    let mut out = vec![0; MAX_MESSAGE_BYTES + 1];
    let payload = vec![0; MAX_MESSAGE_BYTES - TAG_BYTES + 1];
    assert_eq!(host_session.write(&payload, &mut out), Err(Failure::Size));
    assert_eq!(host_session.write(b"", &mut out), Err(Failure::State));
}

#[test]
fn a_message_of_65_536_bytes_fails_the_session() {
    let (mut host_session, _) = connected();
    let mut out = vec![0; MAX_MESSAGE_BYTES];
    assert_eq!(
        host_session.read(&vec![0; MAX_MESSAGE_BYTES + 1], &mut out),
        Err(Failure::Size)
    );
    assert_eq!(host_session.write(b"", &mut out), Err(Failure::State));
}

#[test]
fn no_randomness_fails_the_handshake() {
    let phone = keypair(2);
    let keys = SessionKeys {
        local_private: &phone.private,
        remote_public: None,
        psk: Some(&PSK),
        prologue: PROLOGUE,
    };
    let mut session = Session::start(
        Handshake::Pairing,
        Role::Initiator,
        &keys,
        Box::new(NoRandom),
    )
    .expect("start");
    let mut out = vec![0; MAX_MESSAGE_BYTES];
    assert_eq!(session.write(b"", &mut out), Err(Failure::Noise));
    assert_eq!(session.write(b"", &mut out), Err(Failure::State));
}

#[test]
fn two_sessions_with_different_randomness_send_different_ephemeral_keys() {
    let phone = keypair(2);
    let message1 = |seed| {
        let mut session = ours(Handshake::Pairing, Role::Initiator, &phone, None, seed);
        Party::write(&mut session, b"").expect("write")
    };
    assert_ne!(message1(10), message1(11));
}

#[test]
fn keys_that_do_not_fit_the_handshake_are_refused() {
    let (host, phone) = (keypair(1), keypair(2));
    let start = |handshake, role, remote: Option<&[u8; 32]>, psk: Option<&[u8; 32]>| {
        let keys = SessionKeys {
            local_private: &phone.private,
            remote_public: remote,
            psk,
            prologue: PROLOGUE,
        };
        Session::start(handshake, role, &keys, Box::new(SeededRandom(1))).err()
    };
    let keys = Some(Failure::Keys);
    assert_eq!(start(Handshake::Pairing, Role::Initiator, None, None), keys);
    assert_eq!(
        start(
            Handshake::Pairing,
            Role::Responder,
            Some(&host.public),
            Some(&PSK)
        ),
        keys
    );
    assert_eq!(
        start(Handshake::Reconnect, Role::Initiator, None, None),
        keys
    );
    assert_eq!(
        start(
            Handshake::Reconnect,
            Role::Initiator,
            Some(&host.public),
            Some(&PSK)
        ),
        keys
    );
    assert_eq!(
        start(
            Handshake::Reconnect,
            Role::Responder,
            Some(&host.public),
            None
        ),
        keys
    );
}

#[test]
fn transport_calls_before_the_handshake_ends_fail_the_session() {
    let mut session = ours(Handshake::Pairing, Role::Responder, &keypair(1), None, 3);
    assert_eq!(session.handshake_hash(), Err(Failure::State));
    assert_eq!(session.remote_static(), Err(Failure::State));
    assert!(!session.is_transport());
    assert_eq!(session.rekey_outgoing(), Err(Failure::State));
    let mut phone_snow = theirs(Handshake::Pairing, Role::Initiator, &keypair(2), None, 4);
    let message1 = phone_snow.write(b"").expect("write");
    let mut out = vec![0; MAX_MESSAGE_BYTES];
    assert_eq!(session.read(&message1, &mut out), Err(Failure::State));
}
