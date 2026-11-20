//! What the broker answers the engine, against in-memory and gated backends
//! (requirement `engine-secret-broker`).

mod support;

use std::sync::Arc;
use std::sync::mpsc::{RecvTimeoutError, TryRecvError};
use std::thread;
use std::time::Duration;

use halonic_secret_broker::{
    BrokerAnswer, BrokerRefusal, BrokerRequest, MAX_OUTSTANDING, SecretBroker, TrustRecord,
};
use halonic_secrets::{MemoryBackend, allow_origin, set_secret, set_token};
use halonic_trust_store::FileTrustStore;
use serde_json::json;
use support::{CountingBackend, GatedBackend, Scratch, SwitchedTrust, WatchedTrust};

const CANARY: &str = "acme-canary-7f3a";
const SHORT: Duration = Duration::from_millis(50);
const LONG: Duration = Duration::from_secs(10);

fn secret(name: &str) -> BrokerRequest {
    BrokerRequest::Secret { name: name.into() }
}

fn value(value: &str) -> BrokerAnswer {
    BrokerAnswer::Value {
        value: Some(value.into()),
    }
}

fn refused(reason: BrokerRefusal) -> BrokerAnswer {
    BrokerAnswer::Refused { reason }
}

#[test]
fn engine_secret_broker_answers_secrets_tokens_and_origins() {
    let backend = Arc::new(MemoryBackend::new());
    set_secret(backend.as_ref(), "acme_key", CANARY).expect("stores");
    set_token(backend.as_ref(), "Google-Refresh-Acme", "acme-token").expect("stores");
    allow_origin(backend.as_ref(), "acme_key", "https://llm.example.com").expect("allows");
    let broker = SecretBroker::new(backend, SwitchedTrust::trusted());

    assert_eq!(broker.answer(&secret("Acme-Key")), value(CANARY));
    assert_eq!(
        broker.answer(&secret("acme_missing")),
        BrokerAnswer::Value { value: None }
    );
    let token = BrokerRequest::Token {
        name: "google_refresh_acme".into(),
    };
    assert_eq!(broker.answer(&token), value("acme-token"));
    let origins = BrokerRequest::Origins {
        name: "acme_key".into(),
    };
    assert_eq!(
        broker.answer(&origins),
        BrokerAnswer::Origins {
            origins: Some(vec!["https://llm.example.com".into()])
        }
    );
}

#[test]
fn engine_secret_broker_refuses_halonic_and_plugin_names_before_the_keychain() {
    let backend = CountingBackend::with("token_key", CANARY);
    let broker = SecretBroker::new(backend.clone(), SwitchedTrust::trusted());
    let names = [
        "token_key",
        "Serve-Password",
        "halonic_token_google",
        "plugin__acme__key",
        "Plugin--acme--key",
    ];
    for name in names {
        assert_eq!(
            broker.answer(&secret(name)),
            refused(BrokerRefusal::ReservedName),
            "{name}"
        );
        let origins = BrokerRequest::Origins { name: name.into() };
        assert_eq!(
            broker.answer(&origins),
            refused(BrokerRefusal::ReservedName),
            "{name} origins"
        );
    }
    assert_eq!(
        broker.answer(&secret("9-not-a-name")),
        refused(BrokerRefusal::InvalidName)
    );
    assert_eq!(backend.reads(), 0, "no refused name reached the keychain");
}

#[test]
fn engine_secret_broker_reads_tokens_only_under_the_token_prefix() {
    let backend = CountingBackend::with("acme_key", CANARY);
    let broker = SecretBroker::new(backend.clone(), SwitchedTrust::trusted());
    // A token named like a workspace secret is a different entry.
    let token = BrokerRequest::Token {
        name: "acme_key".into(),
    };
    assert_eq!(broker.answer(&token), BrokerAnswer::Value { value: None });
    let too_long = BrokerRequest::Token {
        name: "a".repeat(115),
    };
    assert_eq!(
        broker.answer(&too_long),
        refused(BrokerRefusal::InvalidName)
    );
    assert_eq!(backend.reads(), 1);
}

#[test]
fn engine_secret_broker_answers_only_for_a_trusted_workspace() {
    let backend = CountingBackend::with("acme_key", CANARY);
    let trust = SwitchedTrust::trusted();
    let broker = SecretBroker::new(backend.clone(), trust.clone());
    assert_eq!(broker.answer(&secret("acme_key")), value(CANARY));
    trust.revoke();
    assert_eq!(
        broker.answer(&secret("acme_key")),
        refused(BrokerRefusal::Untrusted)
    );
    assert_eq!(backend.reads(), 1, "an untrusted request reads nothing");
}

#[test]
fn engine_secret_broker_reads_the_trust_record_the_window_writes() {
    let scratch = Scratch::new("trust-record");
    let store = FileTrustStore::new(scratch.path().join("trust"));
    let location = "acme-workspace";
    let backend = CountingBackend::with("acme_key", CANARY);
    let trust = Arc::new(TrustRecord::new(store.clone(), location.into()));
    let broker = SecretBroker::new(backend, trust);

    assert_eq!(
        broker.answer(&secret("acme_key")),
        refused(BrokerRefusal::Untrusted)
    );
    store
        .grant(&json!({
        "location": location,
        "fingerprint": "acme-fingerprint",
        "content": { "programs": [] },
        "grantedAt": "2026-11-20T10:00:00.000Z",
        "appVersion": "0.1.0",
        "pins": {},
        "origin": "prompt",
        }))
        .expect("the record is saved");
    assert_eq!(broker.answer(&secret("acme_key")), value(CANARY));
    store.revoke(location).expect("the record is removed");
    assert_eq!(
        broker.answer(&secret("acme_key")),
        refused(BrokerRefusal::Untrusted)
    );
}

#[test]
fn engine_secret_broker_answers_unavailable_when_the_keychain_waits_too_long() {
    let (backend, entered, gate) = GatedBackend::closed();
    let broker = SecretBroker::with_timeout(backend, SwitchedTrust::trusted(), SHORT);
    assert_eq!(
        broker.answer(&secret("acme_key")),
        refused(BrokerRefusal::Unavailable)
    );
    entered
        .recv_timeout(LONG)
        .expect("the first call reached the keychain");

    // One call at a time: the second waits for the stuck first one.
    assert_eq!(
        broker.answer(&secret("acme_key")),
        refused(BrokerRefusal::Unavailable)
    );
    assert_eq!(
        entered.recv_timeout(SHORT),
        Err(RecvTimeoutError::Timeout),
        "the second call didn't reach the keychain"
    );

    drop(gate);
}

#[test]
fn engine_secret_broker_drops_a_request_that_timed_out_before_its_keychain_turn() {
    let (backend, entered, gate) = GatedBackend::closed();
    let broker = SecretBroker::with_timeout(backend, SwitchedTrust::trusted(), SHORT);
    for _ in 0..2 {
        assert_eq!(
            broker.answer(&secret("acme_key")),
            refused(BrokerRefusal::Unavailable)
        );
    }
    entered
        .recv_timeout(LONG)
        .expect("one call reached the keychain");

    // The prompt closes; the other request, already answered, gets its turn.
    gate.send(()).expect("the read is waiting");
    assert_eq!(
        entered.recv_timeout(SHORT),
        Err(RecvTimeoutError::Timeout),
        "the request that queued behind it didn't read the keychain"
    );
    drop(gate);
}

#[test]
fn engine_secret_broker_checks_trust_again_when_its_keychain_turn_comes() {
    let (backend, entered, gate) = GatedBackend::closed();
    let (trust, checks) = WatchedTrust::trusted();
    let broker = Arc::new(SecretBroker::with_timeout(backend, trust.clone(), LONG));

    // The first call holds the keychain, like an unlock prompt.
    let first = spawn_answer(&broker);
    entered
        .recv_timeout(LONG)
        .expect("the first call reached the keychain");
    let second = spawn_answer(&broker);
    // Three checks so far: the first request's two and the second's first.
    for _ in 0..3 {
        checks.recv_timeout(LONG).expect("a trust check");
    }

    trust.revoke();
    gate.send(()).expect("the first read is waiting");
    assert_eq!(first.join().expect("answers"), value("gated-value"));
    assert_eq!(
        second.join().expect("answers"),
        refused(BrokerRefusal::Untrusted)
    );
    assert_eq!(
        entered.try_recv(),
        Err(TryRecvError::Empty),
        "only the first call read the keychain"
    );
}

fn spawn_answer(broker: &Arc<SecretBroker>) -> thread::JoinHandle<BrokerAnswer> {
    let broker = Arc::clone(broker);
    thread::spawn(move || broker.answer(&secret("acme_key")))
}

#[test]
fn engine_secret_broker_refuses_when_too_many_requests_are_open() {
    let (backend, _entered, gate) = GatedBackend::closed();
    let broker = SecretBroker::with_timeout(backend, SwitchedTrust::trusted(), Duration::ZERO);
    for _ in 0..MAX_OUTSTANDING {
        assert_eq!(
            broker.answer(&secret("acme_key")),
            refused(BrokerRefusal::Unavailable)
        );
    }
    assert_eq!(
        broker.answer(&secret("acme_key")),
        refused(BrokerRefusal::Busy)
    );
    drop(gate);
}

#[test]
fn engine_secret_broker_answers_never_show_a_value() {
    let shown = format!("{:?}", value(CANARY));
    assert!(!shown.contains(CANARY), "{shown}");
    let frame = serde_json::to_value(value(CANARY)).expect("serializes");
    assert_eq!(frame, json!({ "result": "value", "value": CANARY }));
    let frame = serde_json::to_value(refused(BrokerRefusal::ReservedName)).expect("serializes");
    assert_eq!(
        frame,
        json!({ "result": "refused", "reason": "reserved_name" })
    );
}
