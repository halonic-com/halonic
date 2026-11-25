//! The broker's trust check follows the folder the engine runs in, not
//! only the location the window gave (requirement `engine-secret-broker`).

mod support;

use std::path::Path;
use std::sync::Arc;

use halonic_secret_broker::{
    BrokerAnswer, BrokerRefusal, BrokerRequest, SecretBroker, TrustRecord,
};
use halonic_trust_store::FileTrustStore;
use serde_json::json;
use support::{CountingBackend, Scratch};

const CANARY: &str = "acme-canary-7f3a";

fn secret(name: &str) -> BrokerRequest {
    BrokerRequest::Secret { name: name.into() }
}

fn trust(store: &FileTrustStore, location: &str) {
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
}

fn folder(path: &Path) -> std::path::PathBuf {
    std::fs::create_dir_all(path).expect("the folder can be created");
    std::fs::canonicalize(path).expect("the folder has a real path")
}

#[test]
fn engine_secret_broker_answers_while_the_location_leads_to_the_engine_folder() {
    let scratch = Scratch::new("real-path-same");
    let store = FileTrustStore::new(scratch.path().join("trust"));
    let acme = folder(&scratch.path().join("acme"));
    let location = acme.to_str().expect("a UTF-8 path").to_owned();
    trust(&store, &location);
    let record = TrustRecord::for_workspace(store, location, acme);
    let broker = SecretBroker::new(CountingBackend::with("acme_key", CANARY), Arc::new(record));

    assert_eq!(
        broker.answer(&secret("acme_key")),
        BrokerAnswer::Value {
            value: Some(CANARY.into())
        }
    );
}

#[test]
fn engine_secret_broker_refuses_a_trusted_location_that_leads_elsewhere() {
    let scratch = Scratch::new("real-path-other");
    let store = FileTrustStore::new(scratch.path().join("trust"));
    let acme = folder(&scratch.path().join("acme"));
    let beta = folder(&scratch.path().join("beta"));
    let location = acme.to_str().expect("a UTF-8 path").to_owned();
    trust(&store, &location);
    let backend = CountingBackend::with("acme_key", CANARY);
    let record = TrustRecord::for_workspace(store, location, beta);
    let broker = SecretBroker::new(backend.clone(), Arc::new(record));

    assert_eq!(
        broker.answer(&secret("acme_key")),
        BrokerAnswer::Refused {
            reason: BrokerRefusal::Untrusted
        }
    );
    assert_eq!(backend.reads(), 0, "an untrusted request reads nothing");
}

// Making a link to a folder on Windows needs Developer Mode or an
// administrator, which CI's runners don't promise; the check itself is the
// same code on every system.
#[cfg(unix)]
#[test]
fn engine_secret_broker_refuses_once_a_trusted_link_is_pointed_elsewhere() {
    use std::os::unix::fs::symlink;

    let scratch = Scratch::new("real-path-link");
    let store = FileTrustStore::new(scratch.path().join("trust"));
    let acme = folder(&scratch.path().join("acme"));
    let beta = folder(&scratch.path().join("beta"));
    let link = scratch.path().join("current");
    symlink(&acme, &link).expect("the link is made");
    let location = link.to_str().expect("a UTF-8 path").to_owned();
    trust(&store, &location);
    let backend = CountingBackend::with("acme_key", CANARY);
    let record = TrustRecord::for_workspace(store.clone(), location.clone(), acme);
    let broker = SecretBroker::new(backend.clone(), Arc::new(record));
    assert_eq!(
        broker.answer(&secret("acme_key")),
        BrokerAnswer::Value {
            value: Some(CANARY.into())
        }
    );

    std::fs::remove_file(&link).expect("the link is removed");
    symlink(&beta, &link).expect("the link now leads to beta");
    assert!(
        store.get(&location).expect("the store reads").is_some(),
        "the location's record is still there"
    );

    assert_eq!(
        broker.answer(&secret("acme_key")),
        BrokerAnswer::Refused {
            reason: BrokerRefusal::Untrusted
        }
    );
    assert_eq!(backend.reads(), 1, "the refused request reads nothing");
}
