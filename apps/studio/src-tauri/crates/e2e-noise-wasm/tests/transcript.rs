//! Plain `snow`, natively and as the phone runs it, against the transcript
//! the host's `noise.wasm` wrote (`@halonicjs/adapter-e2e-noise`, requirement
//! `e2e-noise.same-as-snow`). Same keys and ephemeral keys, so every message
//! must be the same bytes: this is the interop test between the two builds.

mod common;

use common::{hex, key, snow_builder};
use halonic_e2e_noise_wasm::MAX_MESSAGE_BYTES;
use serde::Deserialize;
use snow::{HandshakeState, TransportState};

#[derive(Deserialize)]
struct Transcript {
    sessions: Vec<Session>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    name: String,
    protocol_name: String,
    prologue: String,
    psk: Option<String>,
    initiator: Party,
    responder: Party,
    handshake_hash: String,
    steps: Vec<Step>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Party {
    private: String,
    public: String,
    ephemeral: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Step {
    Message {
        from: Side,
        payload: String,
        message: String,
    },
    Rekey {
        rekey: Side,
    },
}

#[derive(Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Side {
    Initiator,
    Responder,
}

fn transcript() -> Transcript {
    let text =
        include_str!("../../../../../../packages/adapters/e2e-noise/src/test/transcript.json");
    serde_json::from_str(text).expect("transcript.json parses")
}

fn build(session: &Session, side: Side) -> HandshakeState {
    let (local, remote) = match side {
        Side::Initiator => (&session.initiator, &session.responder),
        Side::Responder => (&session.responder, &session.initiator),
    };
    let private = key(&local.private);
    let ephemeral = key(&local.ephemeral);
    let remote_public = key(&remote.public);
    let prologue = hex(&session.prologue);
    let psk = session.psk.as_deref().map(key);
    let mut builder = snow_builder(&session.protocol_name, 1)
        .local_private_key(&private)
        .and_then(|builder| builder.prologue(&prologue))
        .expect("builder")
        .fixed_ephemeral_key_for_testing_only(&ephemeral);
    if let Some(psk) = &psk {
        builder = builder.psk(3, psk).expect("psk");
    }
    if side == Side::Initiator && session.protocol_name.contains("_IK_") {
        builder = builder
            .remote_public_key(&remote_public)
            .expect("remote key");
    }
    match side {
        Side::Initiator => builder.build_initiator(),
        Side::Responder => builder.build_responder(),
    }
    .expect("build")
}

/// One side: a handshake until it's over, then transport, keeping the hash.
struct Peer {
    handshake: Option<HandshakeState>,
    transport: Option<TransportState>,
    hash: Vec<u8>,
}

impl Peer {
    fn new(handshake: HandshakeState) -> Self {
        Peer {
            handshake: Some(handshake),
            transport: None,
            hash: Vec::new(),
        }
    }

    fn write(&mut self, payload: &[u8], out: &mut [u8]) -> usize {
        let length = match (&mut self.handshake, &mut self.transport) {
            (Some(handshake), _) => handshake.write_message(payload, out),
            (None, Some(transport)) => transport.write_message(payload, out),
            _ => unreachable!(),
        };
        let length = length.expect("write");
        self.after_message();
        length
    }

    fn read(&mut self, message: &[u8], out: &mut [u8]) -> usize {
        let length = match (&mut self.handshake, &mut self.transport) {
            (Some(handshake), _) => handshake.read_message(message, out),
            (None, Some(transport)) => transport.read_message(message, out),
            _ => unreachable!(),
        };
        let length = length.expect("read");
        self.after_message();
        length
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
        self.transport
            .as_mut()
            .expect("a rekey after the handshake")
    }
}

#[test]
fn the_transcript_has_both_handshakes() {
    let names: Vec<String> = transcript()
        .sessions
        .into_iter()
        .map(|session| session.name)
        .collect();
    assert_eq!(names, ["pairing", "reconnect"]);
}

#[test]
fn plain_snow_writes_and_reads_every_message_of_the_transcript() {
    for session in transcript().sessions {
        let mut initiator = Peer::new(build(&session, Side::Initiator));
        let mut responder = Peer::new(build(&session, Side::Responder));
        let mut sent = vec![0; MAX_MESSAGE_BYTES];
        let mut received = vec![0; MAX_MESSAGE_BYTES];
        for (index, step) in session.steps.iter().enumerate() {
            let label = format!("{} step {index}", session.name);
            let side = match step {
                Step::Message { from, .. } => *from,
                Step::Rekey { rekey } => *rekey,
            };
            let (sender, reader) = match side {
                Side::Initiator => (&mut initiator, &mut responder),
                Side::Responder => (&mut responder, &mut initiator),
            };
            match step {
                Step::Message {
                    payload, message, ..
                } => {
                    let length = sender.write(&hex(payload), &mut sent);
                    assert_eq!(sent[..length], hex(message), "{label}");
                    let read = reader.read(&sent[..length], &mut received);
                    assert_eq!(received[..read], hex(payload), "{label}");
                }
                Step::Rekey { .. } => {
                    sender.transport().rekey_outgoing();
                    reader.transport().rekey_incoming();
                }
            }
        }
        let expected = hex(&session.handshake_hash);
        assert_eq!(initiator.hash, expected, "{}: handshake hash", session.name);
        assert_eq!(responder.hash, expected, "{}: handshake hash", session.name);
    }
}
