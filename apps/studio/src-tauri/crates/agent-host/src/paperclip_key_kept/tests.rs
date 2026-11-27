//! Requirement `studio.src-tauri.paperclip-key-keep`: the shell answers
//! whether it keeps a connection's key as one bit, only for a picked
//! workspace whose connection file names the connection, and never puts the
//! key in its answer or its error.

use std::sync::{Mutex, PoisonError};

use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};
use serde_json::{Value, json};

use super::*;
use crate::paperclip_restore::HandOver;

const REAL_PATH: &str = "/work/acme";
const KEY: &str = "pk-kept";

/// A host whose list answers as told, and that is never handed a key.
struct FakeHost {
    list: Result<Value, HostCallFailed>,
    asked: Mutex<usize>,
}

impl FakeHost {
    fn listing(list: Value) -> Self {
        Self {
            list: Ok(list),
            asked: Mutex::default(),
        }
    }

    fn asked(&self) -> usize {
        *self.asked.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl RestoreHost for FakeHost {
    fn connections(&self, workspace: &str) -> Result<Value, HostCallFailed> {
        assert_eq!(
            workspace, "./acme",
            "the page's name goes to the host as it came"
        );
        *self.asked.lock().unwrap_or_else(PoisonError::into_inner) += 1;
        self.list.clone()
    }

    fn hand_over(&self, _: &HandOver) -> Result<(), HostCallFailed> {
        panic!("asking whether a key is kept hands nothing over")
    }
}

/// The shell's checks: `REAL_PATH` is a picked folder unless told otherwise.
struct FakeChecks {
    picked: bool,
}

impl RestoreChecks for FakeChecks {
    fn is_still_picked(&self, real_path: &str) -> bool {
        self.picked && real_path == REAL_PATH
    }

    fn same_origin(&self, first: &str, second: &str) -> bool {
        first == second
    }
}

const PICKED: FakeChecks = FakeChecks { picked: true };

/// A keychain that counts its reads, and fails them when told to.
#[derive(Default)]
struct CountingKeychain {
    entries: MemoryBackend,
    reads: Mutex<usize>,
    fails: bool,
}

impl CountingKeychain {
    /// A keychain holding the entry of the connection `acme`, signed in from
    /// another workspace.
    fn with_acme() -> Self {
        let keychain = Self::default();
        let entry = json!({
            "key": KEY,
            "address": "https://paperclip.acme.test",
            "company": "company-acme",
            "workspaces": ["/work/other"],
        });
        keychain
            .set(
                &SecretName::paperclip_key("acme").expect("a valid name"),
                &entry.to_string(),
            )
            .expect("stores");
        keychain
    }

    fn reads(&self) -> usize {
        *self.reads.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl SecretBackend for CountingKeychain {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        *self.reads.lock().unwrap_or_else(PoisonError::into_inner) += 1;
        if self.fails {
            return Err(SecretError::Backend {
                message: "the keychain is locked".to_owned(),
            });
        }
        self.entries.get(name)
    }
    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        self.entries.set(name, value)
    }
    fn delete(&self, name: &SecretName) -> Result<(), SecretError> {
        self.entries.delete(name)
    }
    fn get_origins(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.entries.get_origins(name)
    }
    fn set_origins(&self, name: &SecretName, origins: &str) -> Result<(), SecretError> {
        self.entries.set_origins(name, origins)
    }
    fn delete_origins(&self, name: &SecretName) -> Result<(), SecretError> {
        self.entries.delete_origins(name)
    }
}

/// The host's list for `REAL_PATH`: connections named `names`, each with no
/// key on this computer.
fn list_of(names: &[&str]) -> Value {
    let rows: Vec<Value> = names
        .iter()
        .map(|name| json!({ "name": name, "state": { "kind": "no-key" } }))
        .collect();
    json!({ "workspace": REAL_PATH, "mayStart": false, "connections": rows })
}

#[test]
fn an_entry_signed_in_from_another_workspace_counts_as_kept() {
    let keychain = CountingKeychain::with_acme();
    let host = FakeHost::listing(list_of(&["acme"]));

    let kept = paperclip_key_kept(&keychain, &host, &PICKED, "./acme", "acme");

    assert_eq!(kept, Ok(true));
}

#[test]
fn a_listed_connection_without_an_entry_is_not_kept() {
    let keychain = CountingKeychain::default();
    let host = FakeHost::listing(list_of(&["acme", "beta"]));

    assert_eq!(
        paperclip_key_kept(&keychain, &host, &PICKED, "./acme", "beta"),
        Ok(false)
    );
}

#[test]
fn a_name_of_the_wrong_form_is_refused_before_the_host_or_the_keychain_is_asked() {
    let too_long = "a".repeat(65);
    for name in [
        "",
        "-acme",
        "_acme",
        "ac me",
        "acme/..",
        "acmé",
        too_long.as_str(),
    ] {
        let keychain = CountingKeychain::with_acme();
        let host = FakeHost::listing(list_of(&[name]));

        assert_eq!(
            paperclip_key_kept(&keychain, &host, &PICKED, "./acme", name),
            Err(KeptRefusal::InvalidConnection),
            "{name:?}"
        );
        assert_eq!(host.asked(), 0);
        assert_eq!(keychain.reads(), 0);
    }
}

#[test]
fn the_connection_name_takes_the_host_s_form() {
    assert!(is_connection_name("acme"));
    assert!(is_connection_name("Acme_2-b"));
    assert!(is_connection_name(&"a".repeat(64)));
    assert!(!is_connection_name(&"a".repeat(65)));
    assert!(!is_connection_name("acme.yaml"));
}

#[test]
fn a_workspace_the_person_never_picked_is_refused_and_no_entry_is_read() {
    let keychain = CountingKeychain::with_acme();
    let host = FakeHost::listing(list_of(&["acme"]));

    assert_eq!(
        paperclip_key_kept(
            &keychain,
            &host,
            &FakeChecks { picked: false },
            "./acme",
            "acme"
        ),
        Err(KeptRefusal::NotPicked)
    );
    assert_eq!(keychain.reads(), 0);
}

#[test]
fn a_connection_the_workspace_doesn_t_list_is_refused_and_no_entry_is_read() {
    let keychain = CountingKeychain::with_acme();
    // `ACME` shares `acme`'s keychain entry, but the file names only `acme`.
    let host = FakeHost::listing(list_of(&["acme"]));

    assert_eq!(
        paperclip_key_kept(&keychain, &host, &PICKED, "./acme", "ACME"),
        Err(KeptRefusal::UnknownConnection)
    );
    assert_eq!(keychain.reads(), 0);
}

#[test]
fn a_host_that_can_t_list_the_workspace_is_refused_and_no_entry_is_read() {
    let keychain = CountingKeychain::with_acme();
    let host = FakeHost {
        list: Err(HostCallFailed),
        asked: Mutex::default(),
    };

    assert_eq!(
        paperclip_key_kept(&keychain, &host, &PICKED, "./acme", "acme"),
        Err(KeptRefusal::HostUnavailable)
    );
    assert_eq!(keychain.reads(), 0);
}

#[test]
fn a_keychain_that_can_t_be_read_is_an_error_without_the_key_not_false() {
    let keychain = CountingKeychain {
        fails: true,
        ..CountingKeychain::with_acme()
    };
    let host = FakeHost::listing(list_of(&["acme"]));

    let answer = paperclip_key_kept(&keychain, &host, &PICKED, "./acme", "acme");

    let Err(KeptRefusal::Keychain(message)) = &answer else {
        panic!("a keychain refusal, not {answer:?}");
    };
    assert!(message.contains("the keychain is locked"));
    assert!(!message.contains(KEY));
    assert!(!format!("{answer:?}").contains(KEY));
}
