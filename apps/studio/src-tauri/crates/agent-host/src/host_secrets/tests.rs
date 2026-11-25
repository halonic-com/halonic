use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};
use serde_json::{Value, json};

use super::{Refused, answer};
use crate::relay::FRAME_LIMIT;

const VALUE: &str = "a-test-value-not-a-key";

fn ask(backend: &dyn SecretBackend, request: &Value) -> Result<Value, Refused> {
    let bytes = answer(backend, request.to_string().as_bytes())?;
    Ok(serde_json::from_slice(&bytes).expect("the answer is JSON"))
}

#[test]
fn host_secrets_channel_gets_sets_and_deletes_the_host_key() {
    let backend = MemoryBackend::new();
    let get = json!({ "op": "get", "name": "remote_host_key" });
    assert_eq!(
        ask(&backend, &get),
        Ok(json!({ "ok": true, "value": null }))
    );

    let set = json!({ "op": "set", "name": "remote-host-key", "value": VALUE });
    assert_eq!(
        ask(&backend, &set),
        Ok(json!({ "ok": true, "value": null }))
    );
    assert_eq!(
        ask(&backend, &get),
        Ok(json!({ "ok": true, "value": VALUE }))
    );

    let delete = json!({ "op": "delete", "name": "remote_host_key" });
    assert_eq!(
        ask(&backend, &delete),
        Ok(json!({ "ok": true, "value": null }))
    );
    assert_eq!(
        ask(&backend, &get),
        Ok(json!({ "ok": true, "value": null }))
    );
}

#[test]
fn host_secrets_channel_refuses_every_other_name_before_the_backend() {
    let backend = MemoryBackend::new();
    let page_only = SecretName::parse("serve_password").expect("a valid name");
    backend.set(&page_only, VALUE).expect("seed");
    for name in [
        "serve_password",
        "token_key",
        "provider_anthropic",
        "halonic_token_x",
        "1",
    ] {
        for request in [
            json!({ "op": "get", "name": name }),
            json!({ "op": "set", "name": name, "value": VALUE }),
            json!({ "op": "delete", "name": name }),
        ] {
            assert_eq!(ask(&backend, &request), Err(Refused::Name), "{request}");
        }
    }
    assert_eq!(backend.get(&page_only), Ok(Some(VALUE.to_owned())));
}

#[test]
fn host_secrets_channel_refuses_what_isnt_a_request() {
    let backend = MemoryBackend::new();
    let malformed = [
        json!({ "op": "list" }),
        json!({ "op": "get" }),
        json!({ "op": "set", "name": "remote_host_key" }),
        json!({ "op": "get", "name": "remote_host_key", "value": VALUE }),
        json!({ "name": "remote_host_key" }),
        json!("get"),
    ];
    for request in malformed {
        assert_eq!(
            ask(&backend, &request),
            Err(Refused::Malformed),
            "{request}"
        );
    }
    assert_eq!(answer(&backend, b"not json"), Err(Refused::Malformed));
}

#[test]
fn host_secrets_channel_answers_a_keychain_failure_without_the_value() {
    let set = json!({ "op": "set", "name": "remote_host_key", "value": "" });
    let answer = ask(&MemoryBackend::new(), &set).expect("an answer");
    assert_eq!(answer["ok"], json!(false));
    assert_eq!(answer["kind"], json!("invalid_value"));

    let unavailable = ask(
        &Unavailable,
        &json!({ "op": "get", "name": "remote_host_key" }),
    )
    .expect("an answer");
    assert_eq!(unavailable["kind"], json!("unavailable"));
    assert_eq!(unavailable.get("value"), None);
}

/// `{"ok":true,"value":""}`, what every `get` answer holds besides the value.
const ENVELOPE: usize = 22;

/// A value JSON escapes to six bytes per character (`\u0001`), so that its
/// `get` answer is `characters * 6 + ENVELOPE` bytes long.
fn escaped(characters: usize) -> String {
    "\u{1}".repeat(characters)
}

#[test]
fn host_secrets_channel_stores_only_what_it_can_answer_in_one_frame() {
    let backend = MemoryBackend::new();
    let get = json!({ "op": "get", "name": "remote_host_key" });

    let largest = escaped((FRAME_LIMIT - ENVELOPE) / 6);
    let set = json!({ "op": "set", "name": "remote_host_key", "value": largest });
    assert_eq!(
        ask(&backend, &set),
        Ok(json!({ "ok": true, "value": null }))
    );
    let read = answer(&backend, get.to_string().as_bytes()).expect("an answer");
    assert_eq!(read.len(), FRAME_LIMIT);
    assert_eq!(
        ask(&backend, &get),
        Ok(json!({ "ok": true, "value": largest }))
    );

    let too_long = escaped((FRAME_LIMIT - ENVELOPE) / 6 + 1);
    let set = json!({ "op": "set", "name": "remote_host_key", "value": too_long });
    let refused = ask(&backend, &set).expect("an answer");
    assert_eq!(refused["kind"], json!("invalid_value"));
    assert_eq!(
        ask(&backend, &get),
        Ok(json!({ "ok": true, "value": largest }))
    );
}

#[test]
fn host_secrets_channel_refuses_a_name_before_a_value_too_long_to_answer() {
    let set = json!({ "op": "set", "name": "serve_password", "value": escaped(FRAME_LIMIT / 6) });
    assert_eq!(ask(&MemoryBackend::new(), &set), Err(Refused::Name));
}

#[test]
fn host_secrets_channel_answers_a_stored_value_too_long_for_a_frame_as_invalid() {
    let backend = MemoryBackend::new();
    let name = SecretName::parse("remote_host_key").expect("a valid name");
    backend.set(&name, &escaped(FRAME_LIMIT / 6)).expect("seed");

    let get = json!({ "op": "get", "name": "remote_host_key" });
    let read = answer(&backend, get.to_string().as_bytes()).expect("an answer");
    assert!(read.len() <= FRAME_LIMIT);
    let read: Value = serde_json::from_slice(&read).expect("the answer is JSON");
    assert_eq!(read["kind"], json!("invalid_value"));
    assert_eq!(read.get("value"), None);
}

/// A system without a keychain, such as Linux without a Secret Service.
struct Unavailable;

impl SecretBackend for Unavailable {
    fn get(&self, _: &SecretName) -> Result<Option<String>, SecretError> {
        Err(SecretError::Unavailable)
    }
    fn set(&self, _: &SecretName, _: &str) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }
    fn delete(&self, _: &SecretName) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }
    fn get_origins(&self, _: &SecretName) -> Result<Option<String>, SecretError> {
        Err(SecretError::Unavailable)
    }
    fn set_origins(&self, _: &SecretName, _: &str) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }
    fn delete_origins(&self, _: &SecretName) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }
}

#[test]
fn host_secrets_channel_reaches_a_server_pairing_only_in_its_exact_form() {
    let backend = MemoryBackend::new();
    let pairing = "server-pairing__0123456789abcdef0123456789abcdef";
    let set = json!({ "op": "set", "name": pairing, "value": VALUE });
    assert_eq!(
        ask(&backend, &set),
        Ok(json!({ "ok": true, "value": null }))
    );
    assert_eq!(
        ask(&backend, &json!({ "op": "get", "name": pairing })),
        Ok(json!({ "ok": true, "value": VALUE }))
    );
    for other in [
        "Server-Pairing__0123456789abcdef0123456789abcdef",
        "server_pairing__0123456789abcdef0123456789abcdef",
        "server-pairing__",
        "server-pairing__*",
    ] {
        assert_eq!(
            ask(&backend, &json!({ "op": "get", "name": other })),
            Err(Refused::Name),
            "{other}"
        );
    }
    assert_eq!(
        ask(&backend, &json!({ "op": "delete", "name": pairing })),
        Ok(json!({ "ok": true, "value": null }))
    );
}
