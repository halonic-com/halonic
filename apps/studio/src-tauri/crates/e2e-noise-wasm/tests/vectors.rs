//! The published Noise vectors for our two handshakes, through `Session`:
//! every message byte for byte, both ways, and the handshake hash.

mod common;

use common::{FixedRandom, hex, key};
use halonic_e2e_noise_wasm::{Handshake, MAX_MESSAGE_BYTES, Role, Session, SessionKeys};
use serde::Deserialize;

#[derive(Deserialize)]
struct Vectors {
    vectors: Vec<Vector>,
}

#[derive(Deserialize)]
struct Vector {
    source: String,
    protocol_name: String,
    init_prologue: String,
    init_psks: Option<Vec<String>>,
    init_static: String,
    init_ephemeral: String,
    init_remote_static: Option<String>,
    resp_prologue: String,
    resp_psks: Option<Vec<String>>,
    resp_static: String,
    resp_ephemeral: String,
    handshake_hash: Option<String>,
    messages: Vec<Message>,
}

#[derive(Deserialize)]
struct Message {
    payload: String,
    ciphertext: String,
}

fn vectors() -> Vec<Vector> {
    let text = include_str!("vectors.json");
    serde_json::from_str::<Vectors>(text)
        .expect("vectors.json parses")
        .vectors
}

fn handshake_of(vector: &Vector) -> Handshake {
    [Handshake::Pairing, Handshake::Reconnect]
        .into_iter()
        .find(|handshake| handshake.protocol_name() == vector.protocol_name)
        .expect("a vector for one of our handshakes")
}

/// The first psk, when the vector has one.
fn psk_of(psks: &Option<Vec<String>>) -> Option<[u8; 32]> {
    psks.as_ref()
        .and_then(|psks| psks.first())
        .map(|psk| key(psk))
}

fn start(vector: &Vector, role: Role) -> Session {
    let handshake = handshake_of(vector);
    let (private, ephemeral, prologue, psk, remote) = match role {
        Role::Initiator => (
            &vector.init_static,
            &vector.init_ephemeral,
            &vector.init_prologue,
            psk_of(&vector.init_psks),
            vector.init_remote_static.as_deref().map(key),
        ),
        Role::Responder => (
            &vector.resp_static,
            &vector.resp_ephemeral,
            &vector.resp_prologue,
            psk_of(&vector.resp_psks),
            None,
        ),
    };
    let prologue = hex(prologue);
    let keys = SessionKeys {
        local_private: &key(private),
        remote_public: remote.as_ref(),
        psk: psk.as_ref(),
        prologue: &prologue,
    };
    Session::start(
        handshake,
        role,
        &keys,
        Box::new(FixedRandom(Some(hex(ephemeral)))),
    )
    .unwrap_or_else(|failure| {
        panic!(
            "{} {}: start failed: {failure:?}",
            vector.source, vector.protocol_name
        )
    })
}

#[test]
fn every_vector_for_our_handshakes_is_there() {
    let names: Vec<String> = vectors()
        .iter()
        .map(|vector| format!("{} {}", vector.source, vector.protocol_name))
        .collect();
    assert_eq!(
        names,
        [
            "cacophony Noise_IK_25519_ChaChaPoly_SHA256",
            "cacophony Noise_XXpsk3_25519_ChaChaPoly_SHA256",
            "snow Noise_IK_25519_ChaChaPoly_SHA256",
        ],
    );
}

#[test]
fn every_message_matches_the_vectors() {
    for vector in vectors() {
        let name = format!("{} {}", vector.source, vector.protocol_name);
        let mut initiator = start(&vector, Role::Initiator);
        let mut responder = start(&vector, Role::Responder);
        let mut sent = vec![0; MAX_MESSAGE_BYTES];
        let mut received = vec![0; MAX_MESSAGE_BYTES];
        for (index, message) in vector.messages.iter().enumerate() {
            let (sender, reader) = if index % 2 == 0 {
                (&mut initiator, &mut responder)
            } else {
                (&mut responder, &mut initiator)
            };
            let payload = hex(&message.payload);
            let length = sender.write(&payload, &mut sent).expect("write");
            assert_eq!(
                sent[..length],
                hex(&message.ciphertext),
                "{name}: message {index}"
            );
            let read = reader.read(&sent[..length], &mut received).expect("read");
            assert_eq!(received[..read], payload, "{name}: payload {index}");
        }
        assert!(
            initiator.is_transport() && responder.is_transport(),
            "{name}"
        );
        let hash = initiator.handshake_hash().expect("hash");
        assert_eq!(responder.handshake_hash(), Ok(hash), "{name}");
        if let Some(expected) = &vector.handshake_hash {
            assert_eq!(hash.to_vec(), hex(expected), "{name}: handshake hash");
        }
    }
}
