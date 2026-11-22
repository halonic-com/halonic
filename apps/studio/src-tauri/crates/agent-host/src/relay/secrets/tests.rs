//! Id 0 belongs to the host: the relay answers its secret requests there
//! and never gives it to a client, in either direction.

use std::sync::Arc;

use halonic_secrets::{MemoryBackend, SecretBackend, SecretName};
use serde_json::{Value, json};

use super::super::tests::{StandIn, closed, connect, read_all, relay, serve_stand_in, wait_until};
use super::super::{DATA, END, OPEN, RESET, Relay};
use crate::held_backend::Held;

const VALUE: &str = "a-test-value-not-a-key";

fn relay_answering(backend: Arc<dyn SecretBackend>) -> (Relay, StandIn) {
    let mut relay = Relay::bind().expect("bind the relay");
    relay.answer_host_secrets(backend);
    serve_stand_in(relay)
}

fn request(host: &mut StandIn, request: &Value) {
    host.send(0, DATA, request.to_string().as_bytes());
}

fn answer(host: &StandIn) -> Value {
    let (id, kind, bytes) = host.next();
    assert_eq!((id, kind), (0, DATA));
    serde_json::from_slice(&bytes).expect("the answer is JSON")
}

#[test]
fn host_secrets_channel_answers_on_id_0_beside_the_clients() {
    let (relay, mut host) = relay_answering(Arc::new(MemoryBackend::new()));
    let mut client = connect(&relay);
    assert_eq!(
        host.next(),
        (1, OPEN, Vec::new()),
        "a client never gets id 0"
    );

    let set = json!({ "op": "set", "name": "remote_host_key", "value": VALUE });
    request(&mut host, &set);
    assert_eq!(answer(&host), json!({ "ok": true, "value": null }));
    request(
        &mut host,
        &json!({ "op": "get", "name": "remote_host_key" }),
    );
    assert_eq!(answer(&host), json!({ "ok": true, "value": VALUE }));

    host.send(1, DATA, b"only the client's");
    host.send(1, END, &[]);
    assert_eq!(read_all(&mut client), b"only the client's");
}

#[test]
fn host_secrets_channel_stops_the_relay_on_a_name_the_host_may_not_reach() {
    let backend = Arc::new(MemoryBackend::new());
    let page_only = SecretName::parse("serve_password").expect("a valid name");
    backend.set(&page_only, VALUE).expect("seed");
    let (relay, mut host) = relay_answering(backend);
    let mut client = connect(&relay);
    assert_eq!(host.next(), (1, OPEN, Vec::new()));

    request(&mut host, &json!({ "op": "get", "name": "serve_password" }));

    assert!(
        host.input_closed(),
        "no answer, and the host's input closes"
    );
    assert!(closed(&mut client));
    assert!(relay.is_stopped());
}

#[test]
fn host_secrets_channel_stops_the_relay_on_anything_but_a_request_on_id_0() {
    for kind in [OPEN, END, RESET] {
        let (relay, mut host) = relay_answering(Arc::new(MemoryBackend::new()));
        host.send(0, kind, &[]);
        assert!(host.input_closed(), "kind {kind}");
        assert!(relay.is_stopped());
    }
    let (relay, mut host) = relay_answering(Arc::new(MemoryBackend::new()));
    host.send(0, DATA, b"not json");
    assert!(host.input_closed());
    assert!(relay.is_stopped());
}

#[test]
fn host_secrets_channel_is_closed_unless_the_shell_answers_secrets() {
    let (relay, mut host) = relay();
    let mut client = connect(&relay);
    assert_eq!(host.next(), (1, OPEN, Vec::new()));

    request(
        &mut host,
        &json!({ "op": "get", "name": "remote_host_key" }),
    );

    assert!(host.input_closed());
    assert!(closed(&mut client));
}

#[test]
fn host_secrets_channel_takes_one_request_at_a_time() {
    let (backend, release) = Held::with_release();
    let (relay, mut host) = relay_answering(backend);
    let get = json!({ "op": "get", "name": "remote_host_key" });
    request(&mut host, &get);
    request(&mut host, &get);

    // The relay stops on the second request while the first still waits
    // for the keychain; letting that one finish then changes nothing.
    wait_until(|| relay.is_stopped());
    release.send(()).expect("release the first request");
    assert!(host.input_closed());
}
