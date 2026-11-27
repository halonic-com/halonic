//! Requirement `studio.src-tauri.paperclip-key-keep`: through
//! `agent_host_request`, the approved sign-in poll reaches the page without
//! its key, the shell confirms it itself, the page can't send the confirm,
//! and Disconnect deletes the keychain entry whatever the host answers.
//! Against the stand-in host of `agent_host_tests.rs`.

use std::sync::Arc;

use halonic_secrets::{MemoryBackend, SecretBackend, SecretName};
use serde_json::json;
use tauri::Manager;

use super::{AfterHandshake, FakeHost, Seen, Shell, as_json, request};
use crate::secrets::SecretsState;

/// A shell whose keychain is `keychain`.
fn shell_with(fake: &FakeHost, keychain: &Arc<MemoryBackend>) -> Shell {
    let shell = Shell::new(fake, AfterHandshake::WaitForInput);
    let backend: Arc<dyn SecretBackend> = keychain.clone();
    shell.app.manage(SecretsState::with_backend(backend));
    shell
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
fn an_approved_poll_reaches_the_page_without_its_key_and_the_shell_confirms() {
    let fake = FakeHost::serve();
    let keychain = Arc::new(MemoryBackend::new());
    let shell = shell_with(&fake, &keychain);

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
    let shell = shell_with(&fake, &keychain);

    // The stand-in host answers Disconnect 404, as a host that refuses it.
    let answer = request(
        &shell.handle(),
        "POST /v1/paperclip/disconnect",
        Some(json!({ "workspace": "/work/acme", "connection": "acme" })),
    )
    .expect("the host's refusal is an answer");

    assert_eq!(answer.status, 404);
    assert_eq!(
        keychain.get(&entry_name()).expect("the keychain reads"),
        None
    );
}
