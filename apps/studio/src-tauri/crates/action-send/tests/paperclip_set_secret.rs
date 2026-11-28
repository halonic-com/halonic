//! Requirement `studio.src-tauri.crates.action-send.action-send`.
//!
//! `paperclip.set-secret` (note on HAL-17491, row C1; plan OK on HAL-21110)
//! against invented answers: the admin key makes only the calls on its list,
//! and the typed value goes only into the body of the one write that sets it.

mod support;

use std::collections::VecDeque;
use std::future::Future;
use std::sync::Mutex;

use halonic_action_send::paperclip_admin::{PaperclipConnection, store_admin_key};
use halonic_action_send::{
    Answer, Clock, Keychain, Outgoing, Refusal, SendResult, SetSecret, SetSecretStep, Transport,
};
use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};
use serde_json::{Value, json};
use support::{FakeDialogs, FakeLog, NOW, block_on};

const ORIGIN: &str = "https://paperclip.acme.example";
const COMPANY: &str = "c0ffee00-acme";
const ADMIN_KEY: &str = "acme-admin-key-value-0001";
const VALUE: &str = "sentinel-value-never-leaves-the-shell";

const STEP: SetSecretStep<'static> = SetSecretStep {
    name: "ACME_API_KEY",
    host: "paperclip.acme.example",
    company: "ACME",
};

fn answer(status: u16, body: Value) -> Answer {
    Answer {
        status,
        content_type: Some("application/json".to_owned()),
        body: body.to_string().into_bytes(),
        ..Answer::default()
    }
}

fn me() -> Answer {
    answer(200, json!({ "userId": "user-1", "companyIds": [COMPANY] }))
}

fn company() -> Answer {
    answer(200, json!({ "id": COMPANY, "issuePrefix": "ACME" }))
}

fn catalog(entries: Value) -> Answer {
    answer(200, entries)
}

fn existing() -> Value {
    json!([
        { "id": "sec-1", "name": "ACME_API_KEY", "key": "ACME_API_KEY", "status": "active" },
        { "id": "sec-2", "name": "OTHER", "key": "OTHER", "status": "active" },
    ])
}

/// The network: answers from a script, in order, and keeps every call.
#[derive(Default)]
struct ScriptedNetwork {
    script: Mutex<VecDeque<Answer>>,
    calls: Mutex<Vec<Outgoing>>,
}

impl ScriptedNetwork {
    fn new(script: Vec<Answer>) -> Self {
        Self {
            script: Mutex::new(script.into()),
            calls: Mutex::default(),
        }
    }

    /// Each call as `METHOD path`.
    fn routes(&self) -> Vec<String> {
        let calls = self.calls.lock().expect("not poisoned");
        calls
            .iter()
            .map(|call| format!("{} {}", call.method, call.address.path()))
            .collect()
    }

    /// The bodies of the calls that had one, as text.
    fn bodies(&self) -> Vec<(String, String)> {
        let calls = self.calls.lock().expect("not poisoned");
        calls
            .iter()
            .filter_map(|call| {
                let body = call.body.as_ref()?;
                Some((
                    call.address.path().to_owned(),
                    String::from_utf8_lossy(body).into_owned(),
                ))
            })
            .collect()
    }
}

impl Transport for ScriptedNetwork {
    fn send(&self, call: Outgoing) -> impl Future<Output = Result<Answer, String>> + Send {
        self.calls.lock().expect("not poisoned").push(call);
        let next = self.script.lock().expect("not poisoned").pop_front();
        async move { next.ok_or_else(|| "no answer".to_owned()) }
    }
}

struct Keys(MemoryBackend);

impl Keychain for Keys {
    fn with_backend<T, F>(&self, call: F) -> impl Future<Output = Result<T, SecretError>> + Send
    where
        T: Send + 'static,
        F: FnOnce(&dyn SecretBackend) -> Result<T, SecretError> + Send + 'static,
    {
        let answer = call(&self.0);
        async move { answer }
    }
}

struct FixedClock;

impl Clock for FixedClock {
    fn now(&self) -> u64 {
        NOW
    }

    fn pause(&self, _seconds: u64) -> impl Future<Output = ()> + Send {
        async {}
    }
}

/// A keychain with the connection `acme` and, unless `signed_in` is false,
/// an admin key for it.
fn keys(signed_in: bool) -> Keys {
    let backend = MemoryBackend::new();
    let entry = json!({
        "key": "acme-everyday-key-value",
        "address": ORIGIN,
        "company": COMPANY,
        "workspaces": ["/acme/app"],
    });
    backend
        .set(
            &SecretName::paperclip_key("acme").expect("a name"),
            &entry.to_string(),
        )
        .expect("stores the entry");
    if signed_in {
        let connection = PaperclipConnection {
            connection: "acme".to_owned(),
            origin: ORIGIN.to_owned(),
            company: COMPANY.to_owned(),
        };
        store_admin_key(&backend, &connection, "user-1", ADMIN_KEY, NOW).expect("stores");
    }
    Keys(backend)
}

struct Outcome {
    result: SendResult,
    network: ScriptedNetwork,
    dialogs: FakeDialogs,
    log: FakeLog,
}

fn set_secret(
    keys: &Keys,
    step: SetSecretStep<'_>,
    dialogs: FakeDialogs,
    script: Vec<Answer>,
) -> Outcome {
    let network = ScriptedNetwork::new(script);
    let log = FakeLog::default();
    let record = log.record();
    let result = block_on(
        SetSecret {
            transport: &network,
            keychain: keys,
            clock: &FixedClock,
            dialogs: &dialogs,
            log: &record,
        }
        .run(step),
    );
    drop(record);
    Outcome {
        result,
        network,
        dialogs,
        log,
    }
}

fn typing_the_value() -> FakeDialogs {
    FakeDialogs::typing(Some((None, vec![("value", VALUE)])))
}

/// The value is only in the body of `write`, and nowhere in the result or the log.
fn assert_value_only_in(outcome: &Outcome, write: &str) {
    let with_value: Vec<String> = outcome
        .network
        .bodies()
        .into_iter()
        .filter(|(_, body)| body.contains(VALUE))
        .map(|(path, _)| path)
        .collect();
    assert_eq!(with_value, vec![write.to_owned()]);
    assert!(!format!("{:?}", outcome.result).contains(VALUE));
    for line in outcome.log.lines() {
        assert!(!line.contains(VALUE), "{line}");
        assert!(!line.contains(ADMIN_KEY), "{line}");
    }
}

#[test]
fn an_existing_secret_is_rotated_with_the_value_only_in_that_body() {
    let keys = keys(true);
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![
            me(),
            company(),
            catalog(existing()),
            answer(200, json!({ "id": "sec-1" })),
        ],
    );
    assert_eq!(
        outcome.result,
        SendResult::Answered {
            status: 200,
            kept: serde_json::Map::new(),
            error: None
        }
    );
    assert_eq!(
        outcome.network.routes(),
        vec![
            "GET /api/cli-auth/me",
            "GET /api/companies/c0ffee00-acme",
            "GET /api/companies/c0ffee00-acme/secrets/catalog",
            "POST /api/secrets/sec-1/rotate",
        ]
    );
    assert_value_only_in(&outcome, "/api/secrets/sec-1/rotate");
    let asked = outcome.dialogs.asked();
    assert_eq!(asked.len(), 1);
    assert_eq!(asked[0].secrets, vec!["value".to_owned()]);
    assert_eq!(asked[0].confirm.account, "user-1");
}

#[test]
fn a_new_secret_is_created_with_its_name_as_its_key() {
    let keys = keys(true);
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![
            me(),
            company(),
            catalog(json!([])),
            answer(201, json!({ "id": "sec-9" })),
        ],
    );
    assert!(matches!(
        outcome.result,
        SendResult::Answered { status: 201, .. }
    ));
    let bodies = outcome.network.bodies();
    assert_eq!(bodies.len(), 1);
    let sent: Value = serde_json::from_str(&bodies[0].1).expect("JSON");
    assert_eq!(
        sent,
        json!({ "name": "ACME_API_KEY", "key": "ACME_API_KEY", "value": VALUE })
    );
    assert_value_only_in(&outcome, "/api/companies/c0ffee00-acme/secrets");
}

#[test]
fn a_create_that_loses_a_race_reads_the_catalog_once_more_and_rotates() {
    let keys = keys(true);
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![
            me(),
            company(),
            catalog(json!([])),
            answer(
                409,
                json!({ "error": "Secret key already exists: ACME_API_KEY" }),
            ),
            catalog(existing()),
            answer(200, json!({ "id": "sec-1" })),
        ],
    );
    assert!(matches!(
        outcome.result,
        SendResult::Answered { status: 200, .. }
    ));
    let routes = outcome.network.routes();
    assert_eq!(routes.len(), 6);
    assert_eq!(routes[5], "POST /api/secrets/sec-1/rotate");
}

#[test]
fn a_create_that_conflicts_twice_ends_without_a_loop() {
    let keys = keys(true);
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![
            me(),
            company(),
            catalog(json!([])),
            answer(409, json!({ "error": "Secret key already exists" })),
            catalog(json!([])),
        ],
    );
    assert!(matches!(
        outcome.result,
        SendResult::Answered { status: 409, .. }
    ));
    assert_eq!(outcome.network.routes().len(), 5);
}

#[test]
fn a_step_for_another_host_or_company_asks_for_nothing_and_writes_nothing() {
    let keys = keys(true);
    let other_host = SetSecretStep {
        host: "paperclip.evil.example",
        ..STEP
    };
    let outcome = set_secret(&keys, other_host, typing_the_value(), vec![]);
    assert_eq!(
        outcome.result,
        SendResult::Refused {
            reason: Refusal::BadValue
        }
    );
    assert!(outcome.network.routes().is_empty());
    let other_company = SetSecretStep {
        company: "GLOBEX",
        ..STEP
    };
    let outcome = set_secret(
        &keys,
        other_company,
        typing_the_value(),
        vec![me(), company()],
    );
    assert_eq!(
        outcome.result,
        SendResult::Refused {
            reason: Refusal::BadValue
        }
    );
    assert!(outcome.dialogs.asked().is_empty());
    assert!(outcome.network.bodies().is_empty());
}

#[test]
fn a_key_that_no_longer_reaches_the_company_writes_nothing() {
    let keys = keys(true);
    let elsewhere = answer(
        200,
        json!({ "userId": "user-1", "companyIds": ["other-company"] }),
    );
    let outcome = set_secret(&keys, STEP, typing_the_value(), vec![elsewhere]);
    assert_eq!(
        outcome.result,
        SendResult::Refused {
            reason: Refusal::SignedOut
        }
    );
    assert!(outcome.dialogs.asked().is_empty());
    assert_eq!(outcome.network.routes(), vec!["GET /api/cli-auth/me"]);
}

#[test]
fn without_the_admin_key_nothing_is_sent() {
    let keys = keys(false);
    let outcome = set_secret(&keys, STEP, typing_the_value(), vec![]);
    assert_eq!(
        outcome.result,
        SendResult::Refused {
            reason: Refusal::SignedOut
        }
    );
    assert!(outcome.network.routes().is_empty());
}

#[test]
fn closing_the_dialog_or_leaving_the_value_empty_writes_nothing() {
    let keys = keys(true);
    for dialogs in [
        FakeDialogs::typing(None),
        FakeDialogs::typing(Some((None, vec![("value", "")]))),
    ] {
        let outcome = set_secret(&keys, STEP, dialogs, vec![me(), company()]);
        assert_eq!(outcome.result, SendResult::Cancelled);
        assert!(outcome.network.bodies().is_empty());
    }
}

#[test]
fn a_failed_write_says_why_without_the_value() {
    let keys = keys(true);
    let failure = answer(422, json!({ "error": format!("bad value {VALUE}") }));
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![me(), company(), catalog(existing()), failure],
    );
    let SendResult::Answered {
        status: 422,
        error: Some(error),
        ..
    } = &outcome.result
    else {
        panic!("answered 422: {:?}", outcome.result);
    };
    assert!(!error.contains(VALUE));
    assert_value_only_in(&outcome, "/api/secrets/sec-1/rotate");
}
