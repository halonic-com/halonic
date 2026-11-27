//! Requirement `studio.src-tauri.paperclip-key-keep`: the shell hands a kept
//! key back to the host itself, only to a workspace that may start a run and
//! is still a folder the person picked, and only for an entry signed in from
//! it for the address and company its connection file names now.

use std::sync::{Mutex, PoisonError};

use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};
use serde_json::{Value, json};

use super::*;

const REAL_PATH: &str = "/work/acme";
const ADDRESS: &str = "https://paperclip.acme.test";
const COMPANY: &str = "company-acme";

/// A host whose list answers as told, and that remembers each hand-over.
struct FakeHost {
    list: Result<Value, HostCallFailed>,
    hand_overs: Mutex<Vec<Value>>,
    refuses_hand_over: bool,
}

impl FakeHost {
    fn listing(list: Value) -> Self {
        Self {
            list: Ok(list),
            hand_overs: Mutex::default(),
            refuses_hand_over: false,
        }
    }

    fn hand_overs(&self) -> Vec<Value> {
        self.hand_overs
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

impl RestoreHost for FakeHost {
    fn connections(&self, workspace: &str) -> Result<Value, HostCallFailed> {
        assert_eq!(
            workspace, "./acme",
            "the page's name goes to the host as it came"
        );
        self.list.clone()
    }

    fn hand_over(&self, hand_over: &HandOver) -> Result<(), HostCallFailed> {
        self.hand_overs
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(hand_over.body());
        if self.refuses_hand_over {
            return Err(HostCallFailed);
        }
        Ok(())
    }
}

/// The shell's checks: `REAL_PATH` is a picked folder unless told otherwise;
/// origins compare as written, apart from a trailing `/`.
struct FakeChecks {
    picked: bool,
}

impl RestoreChecks for FakeChecks {
    fn is_still_picked(&self, real_path: &str) -> bool {
        self.picked && real_path == REAL_PATH
    }

    fn same_origin(&self, first: &str, second: &str) -> bool {
        first.trim_end_matches('/') == second.trim_end_matches('/')
    }
}

const PICKED: FakeChecks = FakeChecks { picked: true };

/// A keychain that counts its reads, so a test can show a refused restore
/// read no entry.
#[derive(Default)]
struct CountingKeychain {
    entries: MemoryBackend,
    reads: Mutex<usize>,
}

impl CountingKeychain {
    fn reads(&self) -> usize {
        *self.reads.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl SecretBackend for CountingKeychain {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        *self.reads.lock().unwrap_or_else(PoisonError::into_inner) += 1;
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

/// A keychain holding the entry of the connection `acme`, signed in from
/// `workspaces`, for `ADDRESS` and `COMPANY`.
fn keychain_with(workspaces: &[&str]) -> CountingKeychain {
    let keychain = CountingKeychain::default();
    let entry = json!({
        "key": "pk-kept",
        "address": ADDRESS,
        "company": COMPANY,
        "workspaces": workspaces,
    });
    keychain
        .set(
            &SecretName::paperclip_key("acme").expect("a valid name"),
            &entry.to_string(),
        )
        .expect("stores");
    keychain
}

/// The host's list: one connection `acme` in `state`, at `address` and
/// `company`, and `may_start` as the host answers it.
fn list(may_start: Value, state: &str, address: &str, company: &str) -> Value {
    json!({
        "workspace": REAL_PATH,
        "mayStart": may_start,
        "connections": [{
            "name": "acme",
            "label": "Acme",
            "address": address,
            "company": company,
            "state": { "kind": state },
        }],
    })
}

fn usual_list() -> Value {
    list(json!(true), "no-key", ADDRESS, COMPANY)
}

#[test]
fn a_key_goes_back_to_the_picked_workspace_it_was_signed_in_from() {
    let keychain = keychain_with(&["/work/other", REAL_PATH]);
    let host = FakeHost::listing(usual_list());

    assert_eq!(
        restore_paperclip_keys(&keychain, &host, &PICKED, "./acme"),
        Ok(1)
    );

    assert_eq!(
        host.hand_overs(),
        [json!({
            "workspace": REAL_PATH,
            "connection": "acme",
            "key": "pk-kept",
            "address": ADDRESS,
            "company": COMPANY,
        })]
    );
}

#[test]
fn a_signed_out_connection_gets_its_key_back_too_and_a_connected_one_doesnt() {
    let keychain = keychain_with(&[REAL_PATH]);
    let signed_out = FakeHost::listing(list(json!(true), "signed-out", ADDRESS, COMPANY));
    assert_eq!(
        restore_paperclip_keys(&keychain, &signed_out, &PICKED, "./acme"),
        Ok(1)
    );

    // A fresh keychain, so its reads count only this restore's: the row's
    // state is checked before any entry is read.
    let keychain = keychain_with(&[REAL_PATH]);
    let connected = FakeHost::listing(list(json!(true), "connected", ADDRESS, COMPANY));
    assert_eq!(
        restore_paperclip_keys(&keychain, &connected, &PICKED, "./acme"),
        Ok(0)
    );
    assert!(connected.hand_overs().is_empty());
    assert_eq!(keychain.reads(), 0);
}

#[test]
fn nothing_goes_back_and_no_entry_is_read_unless_the_host_says_true() {
    for may_start in [json!(false), Value::Null, json!("true"), json!(1)] {
        let keychain = keychain_with(&[REAL_PATH]);
        let host = FakeHost::listing(list(may_start.clone(), "no-key", ADDRESS, COMPANY));

        assert_eq!(
            restore_paperclip_keys(&keychain, &host, &PICKED, "./acme"),
            Ok(0),
            "{may_start}"
        );
        assert!(host.hand_overs().is_empty(), "{may_start}");
        assert_eq!(keychain.reads(), 0, "{may_start}");
    }
}

#[test]
fn an_older_host_without_may_start_gets_nothing() {
    let keychain = keychain_with(&[REAL_PATH]);
    let mut older = usual_list();
    older.as_object_mut().expect("an object").remove("mayStart");
    let host = FakeHost::listing(older);

    assert_eq!(
        restore_paperclip_keys(&keychain, &host, &PICKED, "./acme"),
        Ok(0)
    );
    assert!(host.hand_overs().is_empty());
    assert_eq!(keychain.reads(), 0);
}

#[test]
fn a_workspace_that_isnt_still_a_picked_folder_gets_nothing() {
    // Not picked, or picked but deleted and made again: `is_still_picked`
    // answers no for both.
    let keychain = keychain_with(&[REAL_PATH]);
    let host = FakeHost::listing(usual_list());
    let not_picked = FakeChecks { picked: false };

    assert_eq!(
        restore_paperclip_keys(&keychain, &host, &not_picked, "./acme"),
        Ok(0)
    );
    assert!(host.hand_overs().is_empty());
    assert_eq!(keychain.reads(), 0);
}

#[test]
fn an_entry_signed_in_from_another_workspace_gets_nothing() {
    let keychain = keychain_with(&["/work/other"]);
    let host = FakeHost::listing(usual_list());

    assert_eq!(
        restore_paperclip_keys(&keychain, &host, &PICKED, "./acme"),
        Ok(0)
    );
    assert!(host.hand_overs().is_empty());
}

#[test]
fn an_entry_made_for_another_address_or_company_gets_nothing() {
    for (address, company) in [("https://evil.test", COMPANY), (ADDRESS, "company-other")] {
        let keychain = keychain_with(&[REAL_PATH]);
        let host = FakeHost::listing(list(json!(true), "no-key", address, company));

        assert_eq!(
            restore_paperclip_keys(&keychain, &host, &PICKED, "./acme"),
            Ok(0),
            "{address} {company}"
        );
        assert!(host.hand_overs().is_empty(), "{address} {company}");
    }
    // The connection file's own spelling of the same origin still fits.
    let keychain = keychain_with(&[REAL_PATH]);
    let host = FakeHost::listing(list(json!(true), "no-key", &format!("{ADDRESS}/"), COMPANY));
    assert_eq!(
        restore_paperclip_keys(&keychain, &host, &PICKED, "./acme"),
        Ok(1)
    );
}

#[test]
fn an_entry_that_isnt_one_or_names_no_workspaces_gets_nothing() {
    let name = SecretName::paperclip_key("acme").expect("a valid name");
    for text in [
        "not json".to_owned(),
        json!({ "key": "pk-kept", "address": ADDRESS, "company": COMPANY }).to_string(),
        json!({ "key": "pk-kept", "address": ADDRESS, "company": COMPANY, "workspaces": [1] })
            .to_string(),
        json!({ "address": ADDRESS, "company": COMPANY, "workspaces": [REAL_PATH] }).to_string(),
    ] {
        let keychain = CountingKeychain::default();
        keychain.set(&name, &text).expect("stores");
        let host = FakeHost::listing(usual_list());

        assert_eq!(
            restore_paperclip_keys(&keychain, &host, &PICKED, "./acme"),
            Ok(0)
        );
        assert!(host.hand_overs().is_empty());
    }
}

#[test]
fn a_list_the_host_couldnt_give_fails_and_a_refused_hand_over_restores_nothing() {
    let keychain = keychain_with(&[REAL_PATH]);
    let unreachable = FakeHost {
        list: Err(HostCallFailed),
        hand_overs: Mutex::default(),
        refuses_hand_over: false,
    };
    assert_eq!(
        restore_paperclip_keys(&keychain, &unreachable, &PICKED, "./acme"),
        Err(HostCallFailed)
    );
    assert_eq!(keychain.reads(), 0);

    let refusing = FakeHost {
        refuses_hand_over: true,
        ..FakeHost::listing(usual_list())
    };
    assert_eq!(
        restore_paperclip_keys(&keychain, &refusing, &PICKED, "./acme"),
        Ok(0)
    );
}

#[test]
fn a_hand_overs_debug_never_shows_the_key() {
    let hand_over = HandOver {
        workspace: REAL_PATH.to_owned(),
        connection: "acme".to_owned(),
        address: ADDRESS.to_owned(),
        company: COMPANY.to_owned(),
        key: PaperclipKey("pk-kept".to_owned()),
    };
    assert!(!format!("{hand_over:?}").contains("pk-kept"));
    assert_eq!(hand_over.connection(), "acme");
    assert_eq!(hand_over.workspace(), REAL_PATH);
}
