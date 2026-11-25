//! Requirement `studio.src-tauri.crates.action-send.action-sign-in`.
//!
//! GitHub's device flow against invented answers: no network, no real
//! keychain and no real waiting. The clock's pauses only move its time on.

mod support;

use std::collections::VecDeque;
use std::future::Future;
use std::sync::{Arc, Mutex};

use halonic_action_send::account::{self, Account};
use halonic_action_send::{
    Answer, Clock, CodeScreen, DEVICE_PAGE, DeviceFlow, Keychain, NEVER_EXPIRES, Outgoing,
    SignInCancel, SignInResult, Transport, UserCode,
};
use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};
use serde_json::{Value, json};
use support::{FakeLog, NOW, TOKEN, block_on};

const CLIENT_ID: &str = "Iv23liAcmeExample01";
const DEVICE_CODE: &str = "acme-device-code-0001";
const REFRESH_TOKEN: &str = "acme-refresh-token-0001";

fn answer(status: u16, body: Value) -> Answer {
    Answer {
        status,
        content_type: Some("application/json".to_owned()),
        body: body.to_string().into_bytes(),
        ..Answer::default()
    }
}

fn code_answer() -> Answer {
    answer(
        200,
        json!({
            "device_code": DEVICE_CODE,
            "user_code": "ACME-1234",
            "verification_uri": "https://evil.example/login/device",
            "expires_in": 900,
            "interval": 5
        }),
    )
}

fn pending() -> Answer {
    answer(200, json!({"error": "authorization_pending"}))
}

fn token_answer(expires_in: Option<u64>) -> Answer {
    let mut body = json!({
        "access_token": TOKEN,
        "token_type": "bearer",
        "refresh_token": REFRESH_TOKEN,
        "refresh_token_expires_in": 15_897_600
    });
    if let Some(seconds) = expires_in {
        body["expires_in"] = json!(seconds);
    }
    answer(200, body)
}

fn user_answer() -> Answer {
    answer(200, json!({"login": "acme-admin", "id": 1}))
}

/// The network: answers from a script, in order, and records every call.
/// `cancel_at` cancels the sign-in while the call with that number (from 1)
/// is answered, as a window closing at that moment would.
#[derive(Default)]
struct ScriptedNetwork {
    script: Mutex<VecDeque<Answer>>,
    calls: Mutex<Vec<Outgoing>>,
    cancel_at: Option<(usize, Arc<SignInCancel>)>,
}

impl ScriptedNetwork {
    fn new(script: Vec<Answer>) -> Self {
        Self {
            script: Mutex::new(script.into()),
            ..Self::default()
        }
    }

    fn addresses(&self) -> Vec<String> {
        let calls = self.calls.lock().expect("not poisoned");
        calls.iter().map(|call| call.address.to_string()).collect()
    }
}

impl Transport for ScriptedNetwork {
    fn send(&self, call: Outgoing) -> impl Future<Output = Result<Answer, String>> + Send {
        let mut calls = self.calls.lock().expect("not poisoned");
        calls.push(call);
        if let Some((number, cancel)) = &self.cancel_at
            && *number == calls.len()
        {
            cancel.cancel();
        }
        let next = self.script.lock().expect("not poisoned").pop_front();
        async move { next.ok_or_else(|| "no answer".to_owned()) }
    }
}

/// The keychain in memory, recording every name written or deleted.
#[derive(Default)]
struct RecordingKeychain {
    backend: MemoryBackend,
    writes: Mutex<Vec<String>>,
}

impl SecretBackend for RecordingKeychain {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.backend.get(name)
    }
    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        self.writes
            .lock()
            .expect("not poisoned")
            .push(name.as_str().to_owned());
        self.backend.set(name, value)
    }
    fn delete(&self, name: &SecretName) -> Result<(), SecretError> {
        self.writes
            .lock()
            .expect("not poisoned")
            .push(name.as_str().to_owned());
        self.backend.delete(name)
    }
    fn get_origins(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.backend.get_origins(name)
    }
    fn set_origins(&self, name: &SecretName, list: &str) -> Result<(), SecretError> {
        self.backend.set_origins(name, list)
    }
    fn delete_origins(&self, name: &SecretName) -> Result<(), SecretError> {
        self.backend.delete_origins(name)
    }
}

impl Keychain for RecordingKeychain {
    fn with_backend<T, F>(&self, call: F) -> impl Future<Output = Result<T, SecretError>> + Send
    where
        T: Send + 'static,
        F: FnOnce(&dyn SecretBackend) -> Result<T, SecretError> + Send + 'static,
    {
        let answer = call(self);
        async move { answer }
    }
}

impl RecordingKeychain {
    fn writes(&self) -> Vec<String> {
        self.writes.lock().expect("not poisoned").clone()
    }
}

/// Time that moves only when the flow pauses. `cancel_at` cancels during
/// the pause with that number (from 1), as closing the stepper would.
struct FakeClock {
    now: Mutex<u64>,
    pauses: Mutex<Vec<u64>>,
    cancel_at: Option<(usize, Arc<SignInCancel>)>,
}

impl FakeClock {
    fn new() -> Self {
        Self {
            now: Mutex::new(NOW),
            pauses: Mutex::default(),
            cancel_at: None,
        }
    }

    fn pauses(&self) -> Vec<u64> {
        self.pauses.lock().expect("not poisoned").clone()
    }
}

impl Clock for FakeClock {
    fn now(&self) -> u64 {
        *self.now.lock().expect("not poisoned")
    }

    fn pause(&self, seconds: u64) -> impl Future<Output = ()> + Send {
        let mut pauses = self.pauses.lock().expect("not poisoned");
        pauses.push(seconds);
        *self.now.lock().expect("not poisoned") += seconds;
        if let Some((number, cancel)) = &self.cancel_at
            && *number == pauses.len()
        {
            cancel.cancel();
        }
        async {}
    }
}

#[derive(Default)]
struct FakeScreen(Mutex<Vec<UserCode>>);

impl CodeScreen for FakeScreen {
    fn show(&self, code: &UserCode) {
        self.0.lock().expect("not poisoned").push(code.clone());
    }
}

struct Run {
    network: ScriptedNetwork,
    keychain: RecordingKeychain,
    clock: FakeClock,
    screen: FakeScreen,
    cancel: Arc<SignInCancel>,
    log: FakeLog,
}

impl Run {
    fn new(script: Vec<Answer>) -> Self {
        Self {
            network: ScriptedNetwork::new(script),
            keychain: RecordingKeychain::default(),
            clock: FakeClock::new(),
            screen: FakeScreen::default(),
            cancel: Arc::default(),
            log: FakeLog::default(),
        }
    }

    fn sign_in(&self, client_id: &str) -> SignInResult {
        let record = self.log.record();
        let flow = DeviceFlow {
            client_id,
            transport: &self.network,
            keychain: &self.keychain,
            clock: &self.clock,
            screen: &self.screen,
            cancel: &self.cancel,
            log: &record,
        };
        block_on(flow.sign_in())
    }

    fn assert_nothing_stored(&self) {
        assert_eq!(self.keychain.writes(), Vec::<String>::new());
        assert_eq!(account::signed_in(&self.keychain, "github", NOW), Ok(None));
    }

    fn assert_no_secret_in_the_log(&self) {
        for line in self.log.lines() {
            for secret in [TOKEN, DEVICE_CODE, REFRESH_TOKEN] {
                assert!(!line.contains(secret), "{line}");
            }
        }
    }
}

#[test]
fn cancelling_during_the_poll_stops_it_and_stores_nothing() {
    let mut run = Run::new(vec![code_answer(), pending(), token_answer(Some(28_800))]);
    run.clock.cancel_at = Some((2, Arc::clone(&run.cancel)));
    assert_eq!(run.sign_in(CLIENT_ID), SignInResult::Cancelled);
    // The code request and the first poll; no poll after the cancel.
    assert_eq!(
        run.network.addresses(),
        [
            "https://github.com/login/device/code",
            "https://github.com/login/oauth/access_token"
        ]
    );
    run.assert_nothing_stored();
    run.assert_no_secret_in_the_log();
}

#[test]
fn a_cancel_while_the_token_arrives_stores_nothing() {
    let mut run = Run::new(vec![
        code_answer(),
        token_answer(Some(28_800)),
        user_answer(),
    ]);
    run.network.cancel_at = Some((2, Arc::clone(&run.cancel)));
    assert_eq!(run.sign_in(CLIENT_ID), SignInResult::Cancelled);
    assert_eq!(run.network.addresses().len(), 2, "no GET /user after it");
    run.assert_nothing_stored();
}

#[test]
fn a_cancel_while_the_login_is_read_stores_nothing() {
    let mut run = Run::new(vec![
        code_answer(),
        token_answer(Some(28_800)),
        user_answer(),
    ]);
    run.network.cancel_at = Some((3, Arc::clone(&run.cancel)));
    assert_eq!(run.sign_in(CLIENT_ID), SignInResult::Cancelled);
    run.assert_nothing_stored();
}

#[test]
fn an_answer_without_expires_in_is_refused() {
    let run = Run::new(vec![code_answer(), token_answer(None), user_answer()]);
    assert_eq!(
        run.sign_in(CLIENT_ID),
        SignInResult::Failed {
            reason: NEVER_EXPIRES.to_owned()
        }
    );
    assert_eq!(
        NEVER_EXPIRES,
        "This GitHub App gives tokens that never expire. Ask its owner to turn on token expiry."
    );
    assert_eq!(run.network.addresses().len(), 2, "no GET /user");
    run.assert_nothing_stored();
    run.assert_no_secret_in_the_log();
}

#[test]
fn a_sign_in_reads_the_login_and_stores_only_the_expiring_token() {
    let run = Run::new(vec![
        code_answer(),
        pending(),
        answer(200, json!({"error": "slow_down", "interval": 10})),
        token_answer(Some(28_800)),
        user_answer(),
    ]);
    let account = Account {
        service: "github".to_owned(),
        name: "acme-admin".to_owned(),
    };
    assert_eq!(
        run.sign_in(CLIENT_ID),
        SignInResult::SignedIn {
            account: account.clone()
        }
    );
    // GitHub's pace: 5 seconds, then 10 after `slow_down`.
    assert_eq!(run.clock.pauses(), [5, 5, 10]);
    let now = run.clock.now();
    assert_eq!(
        account::token(&run.keychain, "github", now),
        Ok(Some((account, TOKEN.to_owned())))
    );
    assert_eq!(
        account::signed_in(&run.keychain, "github", now + 28_800),
        Ok(None)
    );
    // Secret names keep `_` where the login has `-`.
    assert_eq!(
        run.keychain.writes(),
        ["action__github__acme_admin", "action__github"]
    );
    // The code is shown with the shell's own page, not the one GitHub sent.
    let shown = run.screen.0.lock().expect("not poisoned").clone();
    assert_eq!(shown.len(), 1);
    assert_eq!(
        (shown[0].code.as_str(), shown[0].page),
        ("ACME-1234", DEVICE_PAGE)
    );
    run.assert_no_secret_in_the_log();
}

#[test]
fn the_calls_carry_the_public_client_id_and_no_secret() {
    let run = Run::new(vec![code_answer(), token_answer(Some(60)), user_answer()]);
    run.sign_in(CLIENT_ID);
    let calls = run.network.calls.lock().expect("not poisoned");
    let body = |index: usize| {
        String::from_utf8(calls[index].body.clone().unwrap_or_default()).expect("text")
    };
    assert_eq!(body(0), format!("client_id={CLIENT_ID}"));
    assert_eq!(
        body(1),
        format!(
            "client_id={CLIENT_ID}&device_code={DEVICE_CODE}\
             &grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code"
        )
    );
    assert!(calls[..2].iter().all(|call| call.method == "POST"));
    let user = &calls[2];
    assert_eq!(
        (user.method, user.address.as_str()),
        ("GET", "https://api.github.com/user")
    );
    assert!(
        user.headers
            .contains(&("authorization".to_owned(), format!("Bearer {TOKEN}")))
    );
}

#[test]
fn without_a_client_id_the_sign_in_is_not_available() {
    for client_id in ["", "not an id", "Iv1/../x", &"a".repeat(65)] {
        let run = Run::new(vec![code_answer()]);
        assert_eq!(
            run.sign_in(client_id),
            SignInResult::NotAvailable,
            "{client_id}"
        );
        assert_eq!(run.network.addresses().len(), 0);
    }
}

#[test]
fn turning_the_code_down_on_github_cancels_and_an_old_code_fails() {
    let denied = Run::new(vec![
        code_answer(),
        answer(200, json!({"error": "access_denied"})),
    ]);
    assert_eq!(denied.sign_in(CLIENT_ID), SignInResult::Cancelled);
    denied.assert_nothing_stored();
    let expired = Run::new(vec![
        code_answer(),
        answer(200, json!({"error": "expired_token"})),
    ]);
    assert!(matches!(
        expired.sign_in(CLIENT_ID),
        SignInResult::Failed { .. }
    ));
    expired.assert_nothing_stored();
}

#[test]
fn the_poll_stops_when_the_code_expires() {
    let mut script = vec![answer(
        200,
        json!({"device_code": DEVICE_CODE, "user_code": "ACME-1234", "expires_in": 12, "interval": 5}),
    )];
    script.extend((0..10).map(|_| pending()));
    let run = Run::new(script);
    assert!(matches!(
        run.sign_in(CLIENT_ID),
        SignInResult::Failed { .. }
    ));
    // Polls at 5 and 10 seconds; at 15 the 12-second code is gone.
    assert_eq!(run.network.addresses().len(), 3);
    run.assert_nothing_stored();
}
