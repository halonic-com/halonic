//! Requirement `studio.src-tauri.paperclip-key-keep`: the shell keeps the
//! approved sign-in's key in the keychain and confirms it itself, and no
//! answer the page gets holds a key.

use std::sync::{Mutex, PoisonError};

use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};
use serde_json::{Value, json};

use super::*;
use crate::paperclip_routes::{SIGN_IN_CANCEL, SIGN_IN_CONFIRM};

pub(super) const SIGN_IN: &str = "si-1";
pub(super) const WORKSPACE: &str = "/work/acme";

/// A host whose confirm answers as told, and that remembers every call.
pub(super) struct FakeHost {
    confirms: Mutex<Vec<Result<bool, HostCallFailed>>>,
    calls: Mutex<Vec<String>>,
}

impl FakeHost {
    /// A host whose confirms answer `confirms`, in order, then `true`.
    pub(super) fn answering(confirms: Vec<Result<bool, HostCallFailed>>) -> Self {
        Self {
            confirms: Mutex::new(confirms),
            calls: Mutex::default(),
        }
    }

    pub(super) fn calls(&self) -> Vec<String> {
        self.calls
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn note(&self, call: &str, sign_in_id: &str) {
        self.calls
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(format!("{call} {sign_in_id}"));
    }
}

impl SignInHost for FakeHost {
    fn confirm(&self, sign_in_id: &str) -> Result<bool, HostCallFailed> {
        self.note("confirm", sign_in_id);
        let mut confirms = self.confirms.lock().unwrap_or_else(PoisonError::into_inner);
        if confirms.is_empty() {
            return Ok(true);
        }
        confirms.remove(0)
    }

    fn cancel(&self, sign_in_id: &str) -> Result<(), HostCallFailed> {
        self.note("cancel", sign_in_id);
        Ok(())
    }
}

/// A keychain that reads as `MemoryBackend` and refuses every write.
#[derive(Default)]
pub(super) struct RefusesWrites(pub(super) MemoryBackend);

impl SecretBackend for RefusesWrites {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.0.get(name)
    }
    fn set(&self, _: &SecretName, _: &str) -> Result<(), SecretError> {
        Err(SecretError::Denied)
    }
    fn delete(&self, _: &SecretName) -> Result<(), SecretError> {
        Err(SecretError::Denied)
    }
    fn get_origins(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.0.get_origins(name)
    }
    fn set_origins(&self, _: &SecretName, _: &str) -> Result<(), SecretError> {
        Err(SecretError::Denied)
    }
    fn delete_origins(&self, _: &SecretName) -> Result<(), SecretError> {
        Err(SecretError::Denied)
    }
}

pub(super) fn approved(key: &str) -> Value {
    json!({
        "status": "connected",
        "connection": "acme",
        "address": "https://paperclip.acme.test",
        "company": "company-acme",
        "workspace": WORKSPACE,
        "key": key,
    })
}

pub(super) fn entry_name() -> SecretName {
    SecretName::paperclip_key("acme").expect("a connection's entry")
}

pub(super) fn entry(keychain: &dyn SecretBackend) -> Option<Value> {
    let text = keychain.get(&entry_name()).expect("the keychain reads")?;
    Some(serde_json::from_str(&text).expect("the entry is JSON"))
}

/// Whether `answer` holds `key` anywhere.
fn holds(answer: &Value, key: &str) -> bool {
    answer.to_string().contains(key)
}

#[test]
fn an_approved_poll_keeps_the_key_and_confirms_and_the_page_gets_no_key() {
    let keychain = MemoryBackend::new();
    let host = FakeHost::answering(vec![]);

    let answer = keep_poll_answer(
        &keychain,
        &host,
        &KeepTurns::default(),
        SIGN_IN,
        approved("pk-new-1"),
    );

    assert_eq!(
        answer,
        json!({
            "status": "connected",
            "connection": "acme",
            "address": "https://paperclip.acme.test",
            "company": "company-acme",
        })
    );
    assert!(!holds(&answer, "pk-new-1"));
    assert_eq!(host.calls(), vec!["confirm si-1"]);
    assert_eq!(
        entry(&keychain),
        Some(json!({
            "key": "pk-new-1",
            "address": "https://paperclip.acme.test",
            "company": "company-acme",
            "workspaces": [WORKSPACE],
        }))
    );
}

#[test]
fn the_entry_is_the_token_the_page_wrote_before() {
    // The page's `TokenStore` wrote `halonic_token_` and the token's
    // canonical name; the token commands now refuse that name, so the
    // test names the keychain entry itself.
    assert_eq!(entry_name().as_str(), "halonic_token_paperclip_acme");
    assert_eq!(
        SecretName::paperclip_key("Acme_Two")
            .expect("a connection's entry")
            .as_str(),
        "halonic_token_paperclip_acme_two",
    );
}

#[test]
fn a_keychain_that_refuses_the_write_cancels_and_the_page_gets_no_key() {
    let keychain = RefusesWrites::default();
    let host = FakeHost::answering(vec![]);

    let answer = keep_poll_answer(
        &keychain,
        &host,
        &KeepTurns::default(),
        SIGN_IN,
        approved("pk-new-2"),
    );

    assert_eq!(answer, json!({ "status": "key-not-saved" }));
    assert_eq!(host.calls(), vec!["cancel si-1"]);
}

#[test]
fn a_confirm_the_host_refuses_removes_the_entry_and_cancels() {
    let keychain = MemoryBackend::new();
    let host = FakeHost::answering(vec![Ok(false)]);

    let answer = keep_poll_answer(
        &keychain,
        &host,
        &KeepTurns::default(),
        SIGN_IN,
        approved("pk-new-3"),
    );

    assert_eq!(answer, json!({ "status": "key-not-saved" }));
    assert_eq!(host.calls(), vec!["confirm si-1", "cancel si-1"]);
    assert_eq!(entry(&keychain), None);
}

#[test]
fn a_confirm_that_fails_twice_puts_back_the_old_key() {
    let keychain = MemoryBackend::new();
    let old = json!({
        "key": "pk-old",
        "address": "https://paperclip.acme.test",
        "company": "company-acme",
        "workspaces": [WORKSPACE],
    });
    keychain
        .set(&entry_name(), &old.to_string())
        .expect("the old entry");
    let host = FakeHost::answering(vec![Err(HostCallFailed), Err(HostCallFailed)]);

    let answer = keep_poll_answer(
        &keychain,
        &host,
        &KeepTurns::default(),
        SIGN_IN,
        approved("pk-new-4"),
    );

    assert_eq!(answer, json!({ "status": "key-not-saved" }));
    assert_eq!(
        host.calls(),
        vec!["confirm si-1", "confirm si-1", "cancel si-1"]
    );
    assert_eq!(entry(&keychain), Some(old));
}

#[test]
fn a_confirm_whose_answer_got_lost_is_sent_once_more() {
    let keychain = MemoryBackend::new();
    let host = FakeHost::answering(vec![Err(HostCallFailed), Ok(true)]);

    let answer = keep_poll_answer(
        &keychain,
        &host,
        &KeepTurns::default(),
        SIGN_IN,
        approved("pk-new-5"),
    );

    assert_eq!(answer["status"], "connected");
    assert_eq!(host.calls(), vec!["confirm si-1", "confirm si-1"]);
    assert_eq!(entry(&keychain).expect("kept")["key"], "pk-new-5");
}

#[test]
fn an_approved_answer_the_shell_cant_read_is_cancelled_and_passes_on_no_key() {
    let keychain = MemoryBackend::new();
    for broken in [
        json!({ "status": "connected", "connection": "acme", "key": "pk-new-6" }),
        json!({ "status": "connected", "connection": "", "address": "https://paperclip.acme.test",
                "company": "company-acme", "workspace": WORKSPACE, "key": "pk-new-6" }),
        json!({ "status": "connected", "connection": "../acme", "address": "https://paperclip.acme.test",
                "company": "company-acme", "workspace": WORKSPACE, "key": "pk-new-6" }),
    ] {
        let host = FakeHost::answering(vec![]);
        let answer = keep_poll_answer(
            &keychain,
            &host,
            &KeepTurns::default(),
            SIGN_IN,
            broken.clone(),
        );
        assert_eq!(answer, json!({ "status": "key-not-saved" }), "{broken}");
        assert_eq!(host.calls(), vec!["cancel si-1"], "{broken}");
    }
}

#[test]
fn other_poll_answers_pass_on_without_a_key_and_keep_nothing() {
    let keychain = MemoryBackend::new();
    let host = FakeHost::answering(vec![]);
    for (body, page) in [
        (
            json!({ "status": "pending" }),
            json!({ "status": "pending" }),
        ),
        (
            json!({ "status": "expired", "keyMayWork": true }),
            json!({ "status": "expired", "keyMayWork": true }),
        ),
        (
            json!({ "status": "unknown", "key": "pk-stray" }),
            json!({ "status": "unknown" }),
        ),
    ] {
        assert_eq!(
            keep_poll_answer(&keychain, &host, &KeepTurns::default(), SIGN_IN, body),
            page
        );
    }
    assert!(host.calls().is_empty());
    assert_eq!(entry(&keychain), None);
}

#[test]
fn a_cancel_answer_never_holds_a_key() {
    assert_eq!(
        page_cancel_answer(approved("pk-new-7")),
        json!({ "status": "cancelled" })
    );
    assert_eq!(
        page_cancel_answer(json!({ "status": "cancelled", "keyMayWork": true, "key": "pk-x" })),
        json!({ "status": "cancelled", "keyMayWork": true })
    );
}

#[test]
fn sign_in_again_adds_this_workspace_to_an_entry_for_the_same_place() {
    let keychain = MemoryBackend::new();
    let old = json!({
        "key": "pk-old",
        "address": "https://paperclip.acme.test",
        "company": "company-acme",
        "workspaces": ["/work/acme-other", WORKSPACE],
    });
    keychain
        .set(&entry_name(), &old.to_string())
        .expect("the old entry");

    keep_poll_answer(
        &keychain,
        &FakeHost::answering(vec![]),
        &KeepTurns::default(),
        SIGN_IN,
        approved("pk-new-8"),
    );

    let kept = entry(&keychain).expect("kept");
    assert_eq!(kept["key"], "pk-new-8");
    assert_eq!(kept["workspaces"], json!(["/work/acme-other", WORKSPACE]));
}

#[test]
fn a_key_for_another_address_or_company_starts_the_list_again() {
    for (address, company) in [
        ("https://paperclip.globex.test", "company-acme"),
        ("https://paperclip.acme.test", "company-globex"),
    ] {
        let keychain = MemoryBackend::new();
        let old = json!({
            "key": "pk-old",
            "address": address,
            "company": company,
            "workspaces": ["/work/acme-other"],
        });
        keychain
            .set(&entry_name(), &old.to_string())
            .expect("the old entry");

        keep_poll_answer(
            &keychain,
            &FakeHost::answering(vec![]),
            &KeepTurns::default(),
            SIGN_IN,
            approved("pk-new-9"),
        );

        assert_eq!(
            entry(&keychain).expect("kept")["workspaces"],
            json!([WORKSPACE])
        );
    }
}

#[test]
fn an_entry_whose_workspaces_isnt_a_list_of_texts_names_none() {
    let keychain = MemoryBackend::new();
    let old = json!({
        "key": "pk-old",
        "address": "https://paperclip.acme.test",
        "company": "company-acme",
        "workspaces": ["/work/acme-other", 7],
    });
    keychain
        .set(&entry_name(), &old.to_string())
        .expect("the old entry");

    keep_poll_answer(
        &keychain,
        &FakeHost::answering(vec![]),
        &KeepTurns::default(),
        SIGN_IN,
        approved("pk-new-10"),
    );

    assert_eq!(
        entry(&keychain).expect("kept")["workspaces"],
        json!([WORKSPACE])
    );
}

#[test]
fn windows_paths_that_differ_only_in_case_are_one_workspace() {
    assert!(same_workspace(r"C:\Work\Acme", r"c:\work\ACME")); // leak-guard: allow absolute-path invented Windows paths for the case rule
    assert!(same_workspace(
        r"\\server\Share\acme",
        r"\\SERVER\share\acme"
    ));
    assert!(!same_workspace("/work/Acme", "/work/acme"));
    assert!(!same_workspace(r"C:\acme", "/c/acme")); // leak-guard: allow absolute-path invented Windows paths for the case rule
}

#[test]
fn disconnect_deletes_the_entry_and_a_missing_one_is_fine() {
    let keychain = MemoryBackend::new();
    keychain
        .set(&entry_name(), &approved("pk-old").to_string())
        .expect("an entry");

    forget_paperclip_key(&keychain, "acme").expect("deleted");
    assert_eq!(entry(&keychain), None);
    forget_paperclip_key(&keychain, "acme").expect("nothing to delete is fine");
}

#[test]
fn no_page_can_name_the_sign_ins_confirm() {
    use crate::{Answer, find_route};

    assert_eq!(
        find_route("POST /v1/paperclip/sign-in/confirm", Answer::Json),
        None
    );
    assert_eq!(SIGN_IN_CONFIRM.path, "/v1/paperclip/sign-in/confirm");
    assert_eq!(
        find_route("POST /v1/paperclip/sign-in/cancel", Answer::Json),
        Some(SIGN_IN_CANCEL)
    );
}

#[test]
fn the_key_never_shows_in_debug_output() {
    let shown = format!("{:?}", PaperclipKey("pk-secret".to_owned()));
    assert!(!shown.contains("pk-secret"), "{shown}");
}

#[test]
fn spellings_of_one_keychain_entry_share_one_turn() {
    let turns = KeepTurns::default();
    // `acme-x` and `Acme_X` name one keychain entry, so one turn.
    assert!(Arc::ptr_eq(&turns.of("acme-x"), &turns.of("Acme_X")));
    assert!(!Arc::ptr_eq(&turns.of("acme-x"), &turns.of("acme-y")));
}
