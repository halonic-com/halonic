//! Requirement `studio.src-tauri.paperclip-key-keep`: when the keychain
//! can't be read or written, or the confirm fails, the old entry stays or
//! comes back before the sign-in is cancelled; and two keeps for one
//! connection take turns.

use std::sync::{Mutex, PoisonError};

use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};
use serde_json::{Value, json};

use super::tests::{FakeHost, RefusesWrites, SIGN_IN, WORKSPACE, approved, entry, entry_name};
use super::*;

/// A keychain that can't be read, and that records any write in its
/// `MemoryBackend`.
#[derive(Default)]
struct FailsReads(MemoryBackend);

impl SecretBackend for FailsReads {
    fn get(&self, _: &SecretName) -> Result<Option<String>, SecretError> {
        Err(SecretError::Unavailable)
    }
    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        self.0.set(name, value)
    }
    fn delete(&self, name: &SecretName) -> Result<(), SecretError> {
        self.0.delete(name)
    }
    fn get_origins(&self, _: &SecretName) -> Result<Option<String>, SecretError> {
        Err(SecretError::Unavailable)
    }
    fn set_origins(&self, name: &SecretName, origins: &str) -> Result<(), SecretError> {
        self.0.set_origins(name, origins)
    }
    fn delete_origins(&self, name: &SecretName) -> Result<(), SecretError> {
        self.0.delete_origins(name)
    }
}

/// A host that refuses the confirm and, when the sign-in is cancelled,
/// notes what the keychain held at that moment.
struct SeesTheKeychainAtCancel<'a> {
    keychain: &'a MemoryBackend,
    at_cancel: Mutex<Option<Option<Value>>>,
}

impl SignInHost for SeesTheKeychainAtCancel<'_> {
    fn confirm(&self, _: &str) -> Result<bool, HostCallFailed> {
        Ok(false)
    }

    fn cancel(&self, _: &str) -> Result<(), HostCallFailed> {
        let held = entry(self.keychain);
        *self
            .at_cancel
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = Some(held);
        Ok(())
    }
}

/// A host that, when asked to confirm, notes whether the connections'
/// turns were taken at that moment.
struct ChecksTheTurns<'a> {
    turns: &'a KeepTurns,
    at_confirm: Mutex<Option<(bool, bool)>>,
}

impl SignInHost for ChecksTheTurns<'_> {
    fn confirm(&self, _: &str) -> Result<bool, HostCallFailed> {
        let taken = |connection: &str| self.turns.of(connection).try_lock().is_err();
        *self
            .at_confirm
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = Some((taken("acme"), taken("globex")));
        Ok(true)
    }

    fn cancel(&self, _: &str) -> Result<(), HostCallFailed> {
        Ok(())
    }
}

fn old_entry() -> Value {
    json!({
        "key": "pk-old",
        "address": "https://paperclip.acme.test",
        "company": "company-acme",
        "workspaces": [WORKSPACE],
    })
}

#[test]
fn a_keychain_that_cant_be_read_writes_nothing_and_cancels() {
    let keychain = FailsReads::default();
    let host = FakeHost::answering(vec![]);

    let answer = keep_poll_answer(
        &keychain,
        &host,
        &KeepTurns::default(),
        SIGN_IN,
        approved("pk-new-11"),
    );

    assert_eq!(answer, json!({ "status": "key-not-saved" }));
    assert_eq!(host.calls(), vec!["cancel si-1"]);
    assert_eq!(entry(&keychain.0), None);
}

#[test]
fn a_refused_write_on_sign_in_again_leaves_the_old_entry() {
    let keychain = RefusesWrites::default();
    keychain
        .0
        .set(&entry_name(), &old_entry().to_string())
        .expect("the old entry");
    let host = FakeHost::answering(vec![]);

    let answer = keep_poll_answer(
        &keychain,
        &host,
        &KeepTurns::default(),
        SIGN_IN,
        approved("pk-new-12"),
    );

    assert_eq!(answer, json!({ "status": "key-not-saved" }));
    assert_eq!(host.calls(), vec!["cancel si-1"]);
    assert_eq!(entry(&keychain), Some(old_entry()));
}

#[test]
fn the_old_entry_is_back_before_the_sign_in_is_cancelled() {
    let keychain = MemoryBackend::new();
    keychain
        .set(&entry_name(), &old_entry().to_string())
        .expect("the old entry");
    let host = SeesTheKeychainAtCancel {
        keychain: &keychain,
        at_cancel: Mutex::default(),
    };

    let answer = keep_poll_answer(
        &keychain,
        &host,
        &KeepTurns::default(),
        SIGN_IN,
        approved("pk-new-13"),
    );

    assert_eq!(answer, json!({ "status": "key-not-saved" }));
    let at_cancel = host
        .at_cancel
        .into_inner()
        .unwrap_or_else(PoisonError::into_inner);
    assert_eq!(at_cancel, Some(Some(old_entry())));
}

#[test]
fn a_keep_holds_its_connections_turn_while_it_confirms() {
    let keychain = MemoryBackend::new();
    let turns = KeepTurns::default();
    let host = ChecksTheTurns {
        turns: &turns,
        at_confirm: Mutex::default(),
    };

    let answer = keep_poll_answer(&keychain, &host, &turns, SIGN_IN, approved("pk-new-14"));

    assert_eq!(answer["status"], "connected");
    let at_confirm = host
        .at_confirm
        .into_inner()
        .unwrap_or_else(PoisonError::into_inner);
    // Taken for "acme", which is being kept; free for any other connection.
    assert_eq!(at_confirm, Some((true, false)));
    // And free again once the keep is done.
    assert!(turns.of("acme").try_lock().is_ok());
}

#[test]
fn every_other_paperclip_answer_passes_on_without_a_key() {
    assert_eq!(
        page_answer(json!({ "connections": [], "key": "pk-stray" })),
        json!({ "connections": [] })
    );
    assert_eq!(
        page_answer(json!(["not", "an", "object"])),
        json!(["not", "an", "object"])
    );
}
