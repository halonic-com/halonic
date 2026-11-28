//! Requirement `studio.src-tauri.crates.action-send.action-send`.
//!
//! The Paperclip admin key of rows C1 and C5 (note on HAL-17491, 6.8,
//! condition 3) is kept apart from the everyday key and only against the
//! origin and company the connection's own keychain entry names.

mod support;

use halonic_action_send::paperclip_admin::{
    ADMIN_KEY_SECONDS, PaperclipConnection, admin_key, admin_origin, connection_of,
    forget_admin_key, store_admin_key, stored_admin_key,
};
use halonic_secrets::{MemoryBackend, SecretBackend, SecretName};
use support::{NOW, TOKEN};

const EVERYDAY_KEY: &str = "acme-everyday-key-value";

fn connect(backend: &MemoryBackend, address: &str, company: &str) {
    let entry = serde_json::json!({
        "key": EVERYDAY_KEY,
        "address": address,
        "company": company,
        "workspaces": ["/acme/app"],
    });
    backend
        .set(
            &SecretName::paperclip_key("acme").expect("a name"),
            &entry.to_string(),
        )
        .expect("stores the entry");
}

fn acme() -> PaperclipConnection {
    PaperclipConnection {
        connection: "acme".to_owned(),
        origin: "https://paperclip.acme.example".to_owned(),
        company: "c0ffee00-acme".to_owned(),
    }
}

#[test]
fn an_admin_key_goes_only_to_https_or_a_loopback_server() {
    for (address, origin) in [
        (
            "https://paperclip.acme.example",
            "https://paperclip.acme.example",
        ),
        (
            "https://paperclip.acme.example:8443/",
            "https://paperclip.acme.example:8443",
        ),
        ("http://localhost:3100", "http://localhost:3100"),
        ("http://127.0.0.1:3100", "http://127.0.0.1:3100"),
        ("http://[::1]:3100", "http://[::1]:3100"),
    ] {
        assert_eq!(admin_origin(address).as_deref(), Some(origin), "{address}");
    }
    for address in [
        "http://paperclip.acme.example",
        "http://10.0.0.5:3100",
        "ftp://paperclip.acme.example",
        "https://admin:pw@paperclip.acme.example",
        "https://paperclip.acme.example/api",
        "https://paperclip.acme.example/?next=x",
        "https://paperclip.acme.example/#x",
        "not an address",
    ] {
        assert_eq!(admin_origin(address), None, "{address}");
    }
}

#[test]
fn the_connection_comes_from_its_keychain_entry_without_the_everyday_key() {
    let backend = MemoryBackend::new();
    assert_eq!(connection_of(&backend, "acme"), Ok(None));
    connect(&backend, "https://paperclip.acme.example", "c0ffee00-acme");
    let connection = connection_of(&backend, "acme")
        .expect("reads")
        .expect("connected");
    assert_eq!(connection, acme());
    assert!(!format!("{connection:?}").contains(EVERYDAY_KEY));
}

#[test]
fn a_connection_on_a_plain_http_server_elsewhere_gets_no_admin_key() {
    let backend = MemoryBackend::new();
    connect(&backend, "http://paperclip.acme.example", "c0ffee00-acme");
    assert_eq!(connection_of(&backend, "acme"), Ok(None));
    connect(&backend, "https://paperclip.acme.example", "../acme");
    assert_eq!(connection_of(&backend, "acme"), Ok(None));
}

#[test]
fn the_admin_key_is_used_until_it_expires_and_never_as_the_everyday_key() {
    let backend = MemoryBackend::new();
    assert_eq!(admin_key(&backend, &acme(), NOW), Ok(None));
    store_admin_key(&backend, &acme(), "user-1", TOKEN, NOW).expect("stores");
    assert_eq!(
        admin_key(&backend, &acme(), NOW),
        Ok(Some(TOKEN.to_owned()))
    );
    assert_eq!(
        admin_key(&backend, &acme(), NOW + ADMIN_KEY_SECONDS),
        Ok(None)
    );
    // The everyday key's entry is untouched: the admin key has its own.
    let everyday = SecretName::paperclip_key("acme").expect("a name");
    assert_eq!(backend.get(&everyday), Ok(None));
}

#[test]
fn a_connection_that_now_names_another_origin_or_company_gets_no_key() {
    let backend = MemoryBackend::new();
    store_admin_key(&backend, &acme(), "user-1", TOKEN, NOW).expect("stores");
    let moved = PaperclipConnection {
        origin: "https://paperclip.evil.example".to_owned(),
        ..acme()
    };
    assert_eq!(admin_key(&backend, &moved, NOW), Ok(None));
    let other_company = PaperclipConnection {
        company: "other-company".to_owned(),
        ..acme()
    };
    assert_eq!(admin_key(&backend, &other_company, NOW), Ok(None));
    let other_connection = PaperclipConnection {
        connection: "globex".to_owned(),
        ..acme()
    };
    assert_eq!(admin_key(&backend, &other_connection, NOW), Ok(None));
}

#[test]
fn the_admin_key_lives_under_action_names_the_page_cant_reach() {
    let backend = MemoryBackend::new();
    store_admin_key(&backend, &acme(), "user-1", TOKEN, NOW).expect("stores");
    for name in ["action__paperclip", "action__paperclip__admin_key"] {
        let entry = SecretName::parse(name).expect("a name");
        assert!(backend.get(&entry).expect("reads").is_some(), "{name}");
        assert!(entry.is_halonic(), "{name}");
    }
}

#[test]
fn forgetting_the_admin_key_removes_the_key_and_its_record() {
    let backend = MemoryBackend::new();
    store_admin_key(&backend, &acme(), "user-1", TOKEN, NOW).expect("stores");
    forget_admin_key(&backend).expect("forgets");
    assert_eq!(admin_key(&backend, &acme(), NOW), Ok(None));
    for name in ["action__paperclip", "action__paperclip__admin_key"] {
        let entry = SecretName::parse(name).expect("a name");
        assert_eq!(backend.get(&entry), Ok(None), "{name}");
    }
    forget_admin_key(&backend).expect("forgetting twice does nothing");
}

#[test]
fn an_expired_key_can_still_be_found_to_revoke_it_where_it_was_made() {
    let backend = MemoryBackend::new();
    store_admin_key(&backend, &acme(), "user-1", TOKEN, NOW).expect("stores");
    assert_eq!(
        admin_key(&backend, &acme(), NOW + ADMIN_KEY_SECONDS),
        Ok(None)
    );
    assert_eq!(
        stored_admin_key(&backend),
        Ok(Some((acme(), TOKEN.to_owned())))
    );
    forget_admin_key(&backend).expect("forgets");
    assert_eq!(stored_admin_key(&backend), Ok(None));
}
