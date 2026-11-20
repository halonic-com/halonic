//! The origins a stored key may be sent to, against the in-memory backend.

use std::sync::Mutex;

use halonic_secrets::{
    AllowOrigin, MAX_ALLOWED_ORIGINS, MemoryBackend, SecretBackend, SecretError, SecretName,
    allow_origin, allowed_origins, delete_secret, get_secret, set_secret,
};

const ORIGIN: &str = "https://llm.example.com";

fn name(name: &str) -> SecretName {
    SecretName::parse(name).expect("a valid name")
}

fn with_key() -> MemoryBackend {
    let backend = MemoryBackend::new();
    set_secret(&backend, "acme-key", "key value").expect("stores");
    backend
}

#[test]
fn key_origins_match_names_in_canonical_form() {
    let backend = with_key();
    assert_eq!(
        allow_origin(&backend, "Acme_Key", ORIGIN),
        Ok(AllowOrigin::Added)
    );
    assert_eq!(
        allowed_origins(&backend, "ACME-KEY"),
        Ok(Some(vec![ORIGIN.to_owned()]))
    );
}

#[test]
fn key_origins_refuse_bad_and_halonic_names_before_the_backend() {
    let backend = with_key();
    for (name, error) in [
        ("api key", SecretError::InvalidName),
        ("token-key", SecretError::ReservedName),
        ("serve-password", SecretError::ReservedName),
        ("remote-host-key", SecretError::ReservedName),
        (
            "halonic_token_google_refresh_acme",
            SecretError::ReservedName,
        ),
    ] {
        assert_eq!(
            allowed_origins(&backend, name),
            Err(error.clone()),
            "{name}"
        );
        assert_eq!(allow_origin(&backend, name, ORIGIN), Err(error), "{name}");
    }
}

#[test]
fn key_origins_refuse_an_origin_that_cant_be_a_line_of_the_list() {
    let backend = with_key();
    for origin in [
        "",
        "https://a.example.com\nhttps://b.example.com",
        "https://a.example.com ",
        "https://bücher.example",
    ] {
        assert_eq!(
            allow_origin(&backend, "acme-key", origin),
            Err(SecretError::InvalidValue),
            "{origin:?}"
        );
    }
    assert_eq!(allowed_origins(&backend, "acme-key"), Ok(None));
}

#[test]
fn key_origins_hold_at_most_eight() {
    let backend = with_key();
    for port in 0..MAX_ALLOWED_ORIGINS {
        let origin = format!("https://llm.example.com:{}", 8000 + port);
        assert_eq!(
            allow_origin(&backend, "acme-key", &origin),
            Ok(AllowOrigin::Added)
        );
    }
    assert_eq!(
        allow_origin(&backend, "acme-key", ORIGIN),
        Ok(AllowOrigin::Full)
    );
    let stored = allowed_origins(&backend, "acme-key")
        .expect("reads")
        .expect("has origins");
    assert_eq!(stored.len(), MAX_ALLOWED_ORIGINS);
    assert!(!stored.contains(&ORIGIN.to_owned()));
}

#[test]
fn key_origins_are_full_when_one_more_wont_fit_the_store() {
    // Like the Windows Credential Manager: the list must fit one entry.
    let backend = SmallBackend(with_key());
    let long = format!("https://{}.example.com", "a".repeat(80));
    assert_eq!(
        allow_origin(&backend, "acme-key", &long),
        Ok(AllowOrigin::Added)
    );
    assert_eq!(
        allow_origin(&backend, "acme-key", ORIGIN),
        Ok(AllowOrigin::Full)
    );
    assert_eq!(allowed_origins(&backend, "acme-key"), Ok(Some(vec![long])));
}

#[test]
fn key_origins_refuse_a_list_halonic_didnt_write() {
    let backend = with_key();
    let too_many = (0..=MAX_ALLOWED_ORIGINS)
        .map(|port| format!("https://llm.example.com:{}", 8000 + port))
        .collect::<Vec<_>>()
        .join("\n");
    for stored in [
        "",
        "https://llm.example.com\n",
        "https://llm.example.com\nhttps://llm.example.com",
        "https://llm.example.com\r\nhttp://localhost",
        too_many.as_str(),
    ] {
        backend
            .set_origins(&name("acme-key"), stored)
            .expect("stores");
        let error = allowed_origins(&backend, "acme-key").expect_err("not a list we wrote");
        assert_eq!(error.kind(), "backend", "{stored:?}");
        assert!(!error.to_string().contains("example"), "{error}");
        let error = allow_origin(&backend, "acme-key", "http://localhost:11434")
            .expect_err("not a list we wrote");
        assert_eq!(error.kind(), "backend", "{stored:?}");
    }
}

#[test]
fn key_origins_are_removed_before_the_key() {
    // A failure halfway must leave a key without origins, never origins
    // without a key that a new key under the name would take over.
    let backend = OrderBackend::default();
    set_secret(&backend, "acme-key", "key value").expect("stores");
    allow_origin(&backend, "acme-key", ORIGIN).expect("allows");
    delete_secret(&backend, "acme-key").expect("deletes");
    assert_eq!(
        *backend.calls.lock().expect("not poisoned"),
        ["delete_origins", "delete"]
    );
    assert_eq!(get_secret(&backend, "acme-key"), Ok(None));
    assert_eq!(allowed_origins(&backend, "acme-key"), Ok(None));
}

#[test]
fn key_origins_stay_when_removing_them_fails() {
    let backend = FailingOrigins(with_key());
    allow_origin(&backend.0, "acme-key", ORIGIN).expect("allows");
    assert_eq!(
        delete_secret(&backend, "acme-key"),
        Err(SecretError::Denied)
    );
    assert_eq!(
        get_secret(&backend, "acme-key"),
        Ok(Some("key value".to_owned()))
    );
}

/// A backend that keeps short values only, like the Windows Credential
/// Manager.
struct SmallBackend(MemoryBackend);

impl SecretBackend for SmallBackend {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.0.get(name)
    }

    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        self.0.set(name, value)
    }

    fn delete(&self, name: &SecretName) -> Result<(), SecretError> {
        self.0.delete(name)
    }

    fn get_origins(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.0.get_origins(name)
    }

    fn set_origins(&self, name: &SecretName, origins: &str) -> Result<(), SecretError> {
        assert!(origins.len() <= 120, "allow_origin checks the limit");
        self.0.set_origins(name, origins)
    }

    fn delete_origins(&self, name: &SecretName) -> Result<(), SecretError> {
        self.0.delete_origins(name)
    }

    fn max_value_bytes(&self) -> usize {
        120
    }
}

/// A backend that records the order of its deletes.
#[derive(Default)]
struct OrderBackend {
    store: MemoryBackend,
    calls: Mutex<Vec<&'static str>>,
}

impl SecretBackend for OrderBackend {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.store.get(name)
    }

    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        self.store.set(name, value)
    }

    fn delete(&self, name: &SecretName) -> Result<(), SecretError> {
        self.calls.lock().expect("not poisoned").push("delete");
        self.store.delete(name)
    }

    fn get_origins(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.store.get_origins(name)
    }

    fn set_origins(&self, name: &SecretName, origins: &str) -> Result<(), SecretError> {
        self.store.set_origins(name, origins)
    }

    fn delete_origins(&self, name: &SecretName) -> Result<(), SecretError> {
        self.calls
            .lock()
            .expect("not poisoned")
            .push("delete_origins");
        self.store.delete_origins(name)
    }
}

/// A backend that can't remove a list of origins.
struct FailingOrigins(MemoryBackend);

impl SecretBackend for FailingOrigins {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.0.get(name)
    }

    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        self.0.set(name, value)
    }

    fn delete(&self, name: &SecretName) -> Result<(), SecretError> {
        self.0.delete(name)
    }

    fn get_origins(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.0.get_origins(name)
    }

    fn set_origins(&self, name: &SecretName, origins: &str) -> Result<(), SecretError> {
        self.0.set_origins(name, origins)
    }

    fn delete_origins(&self, _name: &SecretName) -> Result<(), SecretError> {
        Err(SecretError::Denied)
    }
}
