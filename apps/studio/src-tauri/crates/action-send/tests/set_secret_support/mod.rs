//! The fakes and invented answers of the `paperclip.set-secret` tests: a
//! scripted Paperclip, a keychain with the connection `acme`, and a run of
//! the operation that keeps what it sent, asked and logged.

#![allow(dead_code)]

use std::collections::VecDeque;
use std::future::Future;
use std::sync::Mutex;

use halonic_action_send::paperclip_admin::{PaperclipConnection, store_admin_key};
use halonic_action_send::{
    Answer, Clock, Keychain, Outgoing, SendResult, SetSecret, SetSecretStep, Transport,
};
use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};
use serde_json::{Value, json};

use super::support::{FakeDialogs, FakeLog, NOW, block_on};

pub const ORIGIN: &str = "https://paperclip.acme.example";
pub const COMPANY: &str = "c0ffee00-acme";
pub const ADMIN_KEY: &str = "acme-admin-key-value-0001";
pub const VALUE: &str = "sentinel-value-never-leaves-the-shell";

pub const STEP: SetSecretStep<'static> = SetSecretStep {
    name: "ACME_API_KEY",
    host: "paperclip.acme.example",
    company: "ACME",
};

pub fn answer(status: u16, body: Value) -> Answer {
    Answer {
        status,
        content_type: Some("application/json".to_owned()),
        body: body.to_string().into_bytes(),
        ..Answer::default()
    }
}

pub fn me() -> Answer {
    answer(200, json!({ "userId": "user-1", "companyIds": [COMPANY] }))
}

pub fn company() -> Answer {
    answer(200, json!({ "id": COMPANY, "issuePrefix": "ACME" }))
}

pub fn catalog(entries: Value) -> Answer {
    answer(200, entries)
}

pub fn existing() -> Value {
    json!([
        { "id": "sec-1", "name": "ACME_API_KEY", "key": "ACME_API_KEY", "status": "active" },
        { "id": "sec-2", "name": "OTHER", "key": "OTHER", "status": "active" },
    ])
}

/// The network: answers from a script, in order, and keeps every call.
#[derive(Default)]
pub struct ScriptedNetwork {
    script: Mutex<VecDeque<Answer>>,
    calls: Mutex<Vec<Outgoing>>,
}

impl ScriptedNetwork {
    pub fn new(script: Vec<Answer>) -> Self {
        Self {
            script: Mutex::new(script.into()),
            calls: Mutex::default(),
        }
    }

    /// Each call as `METHOD path`.
    pub fn routes(&self) -> Vec<String> {
        let calls = self.calls.lock().expect("not poisoned");
        calls
            .iter()
            .map(|call| format!("{} {}", call.method, call.address.path()))
            .collect()
    }

    /// The bodies of the calls that had one, as text.
    pub fn bodies(&self) -> Vec<(String, String)> {
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

pub struct Keys(pub MemoryBackend);

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

pub struct FixedClock;

impl Clock for FixedClock {
    fn now(&self) -> u64 {
        NOW
    }

    async fn pause(&self, _seconds: u64) {}
}

/// A keychain with the connection `acme` and, unless `signed_in` is false,
/// an admin key for it.
pub fn keys(signed_in: bool) -> Keys {
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

pub struct Outcome {
    pub result: SendResult,
    pub network: ScriptedNetwork,
    pub dialogs: FakeDialogs,
    pub log: FakeLog,
}

pub fn set_secret(
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

pub fn typing_the_value() -> FakeDialogs {
    FakeDialogs::typing(Some((None, vec![("value", VALUE)])))
}

/// The value is only in the body of `write`, and nowhere in the result or the log.
pub fn assert_value_only_in(outcome: &Outcome, write: &str) {
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
