//! Requirement `studio.src-tauri.crates.action-send.paperclip-admin-key`.
//!
//! The Paperclip admin key's sign-in (note on HAL-17491, 6.8, condition 3)
//! against invented answers: no network, no real keychain and no real
//! waiting. The clock's pauses only move its time on.

mod support;

use std::collections::VecDeque;
use std::future::Future;
use std::sync::{Arc, Mutex};

use halonic_action_send::paperclip_admin::{PaperclipConnection, admin_key, store_admin_key};
use halonic_action_send::{
    Answer, ApprovalScreen, Clock, Keychain, Outgoing, PaperclipSignIn, SignInCancel, SignInResult,
    Transport,
};
use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};
use serde_json::{Value, json};
use support::{FakeLog, NOW, block_on};
use url::Url;

const ORIGIN: &str = "https://paperclip.acme.example";
const COMPANY: &str = "c0ffee00-acme";
const CHALLENGE_SECRET: &str = "acme-challenge-secret-0001";
const ADMIN_KEY: &str = "acme-admin-key-value-0001";

fn answer(status: u16, body: Value) -> Answer {
    Answer {
        status,
        content_type: Some("application/json".to_owned()),
        body: body.to_string().into_bytes(),
        ..Answer::default()
    }
}

fn challenge(approval_path: &str) -> Answer {
    answer(
        201,
        json!({
            "id": "ch-1",
            "token": CHALLENGE_SECRET,
            "boardApiToken": ADMIN_KEY,
            "approvalPath": approval_path,
        }),
    )
}

fn status(state: &str) -> Answer {
    answer(200, json!({ "status": state }))
}

fn me(companies: &[&str]) -> Answer {
    answer(200, json!({ "userId": "user-1", "companyIds": companies }))
}

fn ok() -> Answer {
    answer(200, json!({ "ok": true }))
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

    /// Each call as `METHOD path`, without its query.
    fn routes(&self) -> Vec<String> {
        let calls = self.calls.lock().expect("not poisoned");
        calls
            .iter()
            .map(|call| format!("{} {}", call.method, call.address.path()))
            .collect()
    }

    fn authorization_of(&self, number: usize) -> Option<String> {
        let calls = self.calls.lock().expect("not poisoned");
        calls[number]
            .headers
            .iter()
            .find(|(name, _)| name == "authorization")
            .map(|(_, value)| value.clone())
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

/// A keychain holding the connection `acme`'s everyday entry for `address`.
fn connected(address: &str) -> Keys {
    let backend = MemoryBackend::new();
    let entry = json!({
        "key": "acme-everyday-key-value",
        "address": address,
        "company": COMPANY,
        "workspaces": ["/acme/app"],
    });
    backend
        .set(
            &SecretName::paperclip_key("acme").expect("a name"),
            &entry.to_string(),
        )
        .expect("stores the entry");
    Keys(backend)
}

fn acme() -> PaperclipConnection {
    PaperclipConnection {
        connection: "acme".to_owned(),
        origin: ORIGIN.to_owned(),
        company: COMPANY.to_owned(),
    }
}

/// Time that moves only when the sign-in pauses. `cancel_at` cancels during
/// the pause with that number (from 1), as closing the stepper would.
struct FakeClock {
    now: Mutex<u64>,
    pauses: Mutex<usize>,
    cancel_at: Option<(usize, Arc<SignInCancel>)>,
}

impl FakeClock {
    fn new() -> Self {
        Self {
            now: Mutex::new(NOW),
            pauses: Mutex::new(0),
            cancel_at: None,
        }
    }
}

impl Clock for FakeClock {
    fn now(&self) -> u64 {
        *self.now.lock().expect("not poisoned")
    }

    fn pause(&self, seconds: u64) -> impl Future<Output = ()> + Send {
        let mut pauses = self.pauses.lock().expect("not poisoned");
        *pauses += 1;
        *self.now.lock().expect("not poisoned") += seconds;
        if let Some((number, cancel)) = &self.cancel_at
            && *number == *pauses
        {
            cancel.cancel();
        }
        async {}
    }
}

#[derive(Default)]
struct FakeBrowser(Mutex<Vec<String>>);

impl ApprovalScreen for FakeBrowser {
    fn show(&self, page: &Url) {
        self.0.lock().expect("not poisoned").push(page.to_string());
    }
}

struct Outcome {
    result: SignInResult,
    network: ScriptedNetwork,
    keys: Keys,
    browser: FakeBrowser,
    log: FakeLog,
}

fn sign_in(keys: Keys, script: Vec<Answer>, cancel_at_pause: Option<usize>) -> Outcome {
    let network = ScriptedNetwork::new(script);
    let cancel = Arc::new(SignInCancel::default());
    let mut clock = FakeClock::new();
    clock.cancel_at = cancel_at_pause.map(|number| (number, Arc::clone(&cancel)));
    let browser = FakeBrowser::default();
    let log = FakeLog::default();
    let record = log.record();
    let result = block_on(
        PaperclipSignIn {
            connection: "acme",
            transport: &network,
            keychain: &keys,
            clock: &clock,
            screen: &browser,
            cancel: &cancel,
            log: &record,
        }
        .sign_in(),
    );
    drop(record);
    Outcome {
        result,
        network,
        keys,
        browser,
        log,
    }
}

fn stored_key(keys: &Keys) -> Option<String> {
    admin_key(&keys.0, &acme(), NOW).expect("reads")
}

fn assert_no_secret_in(log: &FakeLog) {
    for line in log.lines() {
        assert!(!line.contains(ADMIN_KEY), "{line}");
        assert!(!line.contains(CHALLENGE_SECRET), "{line}");
    }
}

#[test]
fn an_approved_sign_in_keeps_the_admin_key_for_the_connection_only() {
    let outcome = sign_in(
        connected(ORIGIN),
        vec![
            challenge("/cli-auth/approve/ch-1"),
            status("pending"),
            status("approved"),
            me(&[COMPANY]),
        ],
        None,
    );
    let SignInResult::SignedIn { account } = &outcome.result else {
        panic!("signed in: {:?}", outcome.result);
    };
    assert_eq!(
        (account.service.as_str(), account.name.as_str()),
        ("paperclip", "user-1")
    );
    assert_eq!(stored_key(&outcome.keys).as_deref(), Some(ADMIN_KEY));
    assert_eq!(
        outcome.browser.0.lock().expect("not poisoned").clone(),
        vec![format!("{ORIGIN}/cli-auth/approve/ch-1")]
    );
    assert_eq!(
        outcome.network.routes(),
        vec![
            "POST /api/cli-auth/challenges",
            "GET /api/cli-auth/challenges/ch-1",
            "GET /api/cli-auth/challenges/ch-1",
            "GET /api/cli-auth/me",
        ]
    );
    // Only the check of whose key it is carries the key; the challenge's calls don't.
    assert_eq!(outcome.network.authorization_of(1), None);
    assert_eq!(
        outcome.network.authorization_of(3),
        Some(format!("Bearer {ADMIN_KEY}"))
    );
    // The answer the page gets holds the account, never the key.
    let answered = serde_json::to_string(&outcome.result).expect("serialises");
    assert!(!answered.contains(ADMIN_KEY));
    assert_no_secret_in(&outcome.log);
}

#[test]
fn the_approval_page_opens_only_on_the_connections_own_origin() {
    for path in [
        "https://paperclip.evil.example/cli-auth/approve/ch-1",
        "/settings/secrets",
        "/cli-auth/../settings",
        // Julian's review of #6946: the parsed path is what counts.
        "/cli-auth/%2e%2e/settings",
        "/cli-auth/.\t./settings",
        "//paperclip.evil.example/cli-auth/x",
    ] {
        let outcome = sign_in(connected(ORIGIN), vec![challenge(path)], None);
        assert!(
            matches!(outcome.result, SignInResult::Failed { .. }),
            "{path}"
        );
        assert!(
            outcome.browser.0.lock().expect("not poisoned").is_empty(),
            "{path}"
        );
        assert_eq!(stored_key(&outcome.keys), None, "{path}");
    }
}

#[test]
fn a_key_that_cant_reach_the_company_is_revoked_and_never_kept() {
    let outcome = sign_in(
        connected(ORIGIN),
        vec![
            challenge("/cli-auth/approve/ch-1"),
            status("approved"),
            me(&["other-company"]),
            ok(),
            ok(),
        ],
        None,
    );
    assert!(matches!(outcome.result, SignInResult::Failed { .. }));
    assert_eq!(stored_key(&outcome.keys), None);
    let routes = outcome.network.routes();
    assert_eq!(
        routes.last().map(String::as_str),
        Some("POST /api/cli-auth/revoke-current")
    );
    assert_eq!(
        outcome.network.authorization_of(routes.len() - 1),
        Some(format!("Bearer {ADMIN_KEY}"))
    );
}

#[test]
fn closing_the_stepper_while_waiting_cancels_the_challenge_and_revokes_its_key() {
    let outcome = sign_in(
        connected(ORIGIN),
        vec![challenge("/cli-auth/approve/ch-1"), ok(), ok()],
        Some(1),
    );
    assert_eq!(outcome.result, SignInResult::Cancelled);
    assert_eq!(stored_key(&outcome.keys), None);
    assert_eq!(
        outcome.network.routes(),
        vec![
            "POST /api/cli-auth/challenges",
            "POST /api/cli-auth/challenges/ch-1/cancel",
            "POST /api/cli-auth/revoke-current",
        ]
    );
    assert_no_secret_in(&outcome.log);
}

#[test]
fn a_challenge_nobody_approves_in_time_ends_without_a_key() {
    let mut script = vec![challenge("/cli-auth/approve/ch-1")];
    script.extend((0..400).map(|_| status("pending")));
    let outcome = sign_in(connected(ORIGIN), script, None);
    assert!(matches!(outcome.result, SignInResult::Failed { .. }));
    assert_eq!(stored_key(&outcome.keys), None);
}

#[test]
fn without_a_usable_connection_nothing_is_sent() {
    let unconnected = sign_in(Keys(MemoryBackend::new()), vec![], None);
    assert!(matches!(unconnected.result, SignInResult::Failed { .. }));
    assert!(unconnected.network.routes().is_empty());
    let plain_http = sign_in(connected("http://paperclip.acme.example"), vec![], None);
    assert!(matches!(plain_http.result, SignInResult::Failed { .. }));
    assert!(plain_http.network.routes().is_empty());
}

#[test]
fn signing_out_revokes_the_admin_key_and_forgets_it() {
    let signed_in = sign_in(
        connected(ORIGIN),
        vec![
            challenge("/cli-auth/approve/ch-1"),
            status("approved"),
            me(&[COMPANY]),
        ],
        None,
    );
    assert_eq!(stored_key(&signed_in.keys).as_deref(), Some(ADMIN_KEY));
    let network = ScriptedNetwork::new(vec![ok()]);
    let cancel = Arc::new(SignInCancel::default());
    let log = FakeLog::default();
    let record = log.record();
    let signed_out = block_on(
        PaperclipSignIn {
            connection: "acme",
            transport: &network,
            keychain: &signed_in.keys,
            clock: &FakeClock::new(),
            screen: &FakeBrowser::default(),
            cancel: &cancel,
            log: &record,
        }
        .sign_out(),
    );
    assert_eq!(signed_out, Ok(()));
    assert_eq!(network.routes(), vec!["POST /api/cli-auth/revoke-current"]);
    assert_eq!(
        network.authorization_of(0),
        Some(format!("Bearer {ADMIN_KEY}"))
    );
    assert_eq!(stored_key(&signed_in.keys), None);
}

#[test]
fn a_second_sign_in_revokes_the_key_it_replaces() {
    // Julian's review of #6946: Paperclip keeps a CLI key for 30 days, so
    // the replaced key is revoked, not only overwritten.
    let keys = connected(ORIGIN);
    store_admin_key(&keys.0, &acme(), "user-1", "acme-first-key", NOW).expect("stores");
    let outcome = sign_in(
        keys,
        vec![
            challenge("/cli-auth/approve/ch-1"),
            status("approved"),
            me(&[COMPANY]),
            ok(),
        ],
        None,
    );
    assert!(matches!(outcome.result, SignInResult::SignedIn { .. }));
    assert_eq!(stored_key(&outcome.keys).as_deref(), Some(ADMIN_KEY));
    let routes = outcome.network.routes();
    assert_eq!(
        routes.last().map(String::as_str),
        Some("POST /api/cli-auth/revoke-current")
    );
    assert_eq!(
        outcome.network.authorization_of(routes.len() - 1),
        Some("Bearer acme-first-key".to_owned())
    );
}
