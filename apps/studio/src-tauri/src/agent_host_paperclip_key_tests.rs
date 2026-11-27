//! Requirement `studio.src-tauri.paperclip-key-keep`: through
//! `agent_host_request`, the approved sign-in poll reaches the page without
//! its key, the shell confirms it itself, the page can't send the confirm
//! or hand a key over, and Disconnect deletes the keychain entry whatever
//! the host answers, or tells the page when the keychain refused.
//! Against the stand-in host of `agent_host_tests.rs`.

use std::net::TcpListener;
use std::sync::Arc;
use std::sync::mpsc::channel;

use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};
use serde_json::json;
use tauri::Manager;

use super::{AfterHandshake, FakeHost, HostAnswer, HostRefusal, Seen, Shell, as_json, request};
use crate::secrets::SecretsState;

/// A shell whose keychain is `keychain`.
fn shell_with(fake: &FakeHost, keychain: Arc<dyn SecretBackend>) -> Shell {
    let shell = Shell::new(fake, AfterHandshake::WaitForInput);
    shell.app.manage(SecretsState::with_backend(keychain));
    shell
}

/// A host the shell can't reach: its handshake names a port nobody listens
/// on.
fn unreachable_host() -> FakeHost {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback port");
    let port = listener.local_addr().expect("its address").port();
    drop(listener);
    let (_, seen) = channel();
    let (release_bridge, _) = channel();
    FakeHost {
        port,
        seen,
        release_bridge,
    }
}

/// A keychain that reads and writes as `MemoryBackend` but refuses every
/// delete.
#[derive(Default)]
struct RefusesDeletes(MemoryBackend);

impl SecretBackend for RefusesDeletes {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.0.get(name)
    }
    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        self.0.set(name, value)
    }
    fn delete(&self, _: &SecretName) -> Result<(), SecretError> {
        Err(SecretError::Denied)
    }
    fn get_origins(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.0.get_origins(name)
    }
    fn set_origins(&self, name: &SecretName, origins: &str) -> Result<(), SecretError> {
        self.0.set_origins(name, origins)
    }
    fn delete_origins(&self, _: &SecretName) -> Result<(), SecretError> {
        Err(SecretError::Denied)
    }
}

fn disconnect(shell: &Shell) -> Result<HostAnswer, HostRefusal> {
    request(
        &shell.handle(),
        "POST /v1/paperclip/disconnect",
        Some(json!({ "workspace": "/work/acme", "connection": "acme" })),
    )
}

fn entry_name() -> SecretName {
    SecretName::paperclip_key("acme").expect("a connection's entry")
}

/// The next request the fake host saw, as its route and body.
fn next_request(fake: &FakeHost) -> (String, String) {
    match fake.next() {
        Seen::Request { route, body, .. } => (route, body),
        Seen::HungUp(path) => panic!("a request, not a hang-up on {path}"),
    }
}

#[test]
fn the_page_cant_send_the_sign_ins_confirm() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);

    let refusal = request(
        &shell.handle(),
        "POST /v1/paperclip/sign-in/confirm",
        Some(json!({ "signInId": "si-1" })),
    )
    .expect_err("the page may not confirm");

    assert!(as_json(&refusal).contains(r#""kind":"unknown_route""#));
    // Refused before anything reached a host: none was even started.
    assert_eq!(shell.starts(), 0);
}

#[test]
fn the_page_cant_hand_a_key_over() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);

    let refusal = request(
        &shell.handle(),
        "POST /v1/paperclip/key",
        Some(json!({
            "workspace": "/work/acme",
            "connection": "acme",
            "key": "pk-from-the-page",
            "address": "https://paperclip.acme.test",
            "company": "company-acme",
        })),
    )
    .expect_err("only the shell hands a key over");

    assert!(as_json(&refusal).contains(r#""kind":"unknown_route""#));
    assert!(!as_json(&refusal).contains("pk-from-the-page"));
    // Refused before anything reached a host: none was even started.
    assert_eq!(shell.starts(), 0);
}

#[test]
fn the_restore_compares_addresses_by_origin() {
    use super::super::paperclip_key::same_origin;

    let address = "https://paperclip.acme.test";
    assert!(same_origin(address, "https://PAPERCLIP.acme.test:443/"));
    assert!(same_origin(
        "http://localhost:3100",
        "http://localhost:3100/api"
    ));
    assert!(!same_origin(address, "http://paperclip.acme.test"));
    assert!(!same_origin(address, "https://paperclip.acme.test:8443"));
    assert!(!same_origin(address, "https://evil.test"));
    assert!(!same_origin("not an address", "not an address"));
    assert!(!same_origin("data:text/plain,acme", "data:text/plain,acme"));
}

#[test]
fn an_approved_poll_reaches_the_page_without_its_key_and_the_shell_confirms() {
    let fake = FakeHost::serve();
    let keychain = Arc::new(MemoryBackend::new());
    let shell = shell_with(&fake, keychain.clone());

    let answer = request(
        &shell.handle(),
        "POST /v1/paperclip/sign-in/poll",
        Some(json!({ "signInId": "si-1" })),
    )
    .expect("the poll is answered");

    assert_eq!(answer.status, 200);
    assert_eq!(
        answer.body,
        json!({
            "status": "connected",
            "connection": "acme",
            "address": "https://paperclip.acme.test",
            "company": "company-acme",
        })
    );
    assert!(!as_json(&answer).contains("pk-from-the-host"));
    assert_eq!(next_request(&fake).0, "POST /v1/paperclip/sign-in/poll");
    let (route, body) = next_request(&fake);
    assert_eq!(route, "POST /v1/paperclip/sign-in/confirm");
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&body).expect("JSON"),
        json!({ "signInId": "si-1" })
    );
    let kept = keychain
        .get(&entry_name())
        .expect("the keychain reads")
        .expect("the key is kept");
    assert!(kept.contains("pk-from-the-host"));
}

#[test]
fn disconnect_deletes_the_entry_also_when_the_host_refuses() {
    let fake = FakeHost::serve();
    let keychain = Arc::new(MemoryBackend::new());
    keychain
        .set(&entry_name(), r#"{"key":"pk-old"}"#)
        .expect("an entry");
    let shell = shell_with(&fake, keychain.clone());

    // The stand-in host answers Disconnect 404, as a host that refuses it.
    let answer = disconnect(&shell).expect("the host's refusal is an answer");

    assert_eq!(answer.status, 404);
    assert_eq!(
        keychain.get(&entry_name()).expect("the keychain reads"),
        None
    );
}

#[test]
fn disconnect_deletes_the_entry_also_when_the_host_cant_be_reached() {
    let fake = unreachable_host();
    let keychain = Arc::new(MemoryBackend::new());
    keychain
        .set(&entry_name(), r#"{"key":"pk-old"}"#)
        .expect("an entry");
    let shell = shell_with(&fake, keychain.clone());

    disconnect(&shell).expect_err("no host answers");

    assert_eq!(
        keychain.get(&entry_name()).expect("the keychain reads"),
        None
    );
}

#[test]
fn disconnect_tells_the_page_when_the_keychain_refuses_the_delete() {
    let fake = FakeHost::serve();
    let keychain = Arc::new(RefusesDeletes::default());
    keychain
        .set(&entry_name(), r#"{"key":"pk-old"}"#)
        .expect("an entry");
    let shell = shell_with(&fake, keychain.clone());

    let refusal = disconnect(&shell).expect_err("the keychain refused");

    assert!(as_json(&refusal).contains(r#""kind":"keychain""#));
    assert!(!as_json(&refusal).contains("pk-old"));
}
