//! The agent host's own secrets: only the names in `HOST_NAMES`.

use halonic_secrets::{
    HALONIC_NAMES, HOST_NAMES, MemoryBackend, SecretBackend, SecretError, SecretName,
    delete_host_secret, get_host_secret, set_host_secret, set_secret, set_token,
};

const VALUE: &str = "a-test-value-not-a-key";

#[test]
fn host_secrets_keep_a_host_name_in_its_canonical_form() {
    let backend = MemoryBackend::new();
    set_host_secret(&backend, "remote-host-key", VALUE).expect("set");
    assert_eq!(
        get_host_secret(&backend, "remote_host_key"),
        Ok(Some(VALUE.to_owned()))
    );
    let canonical = SecretName::parse("remote_host_key").expect("a valid name");
    assert_eq!(backend.get(&canonical), Ok(Some(VALUE.to_owned())));

    delete_host_secret(&backend, "remote_host_key").expect("delete");
    assert_eq!(get_host_secret(&backend, "remote_host_key"), Ok(None));
    delete_host_secret(&backend, "remote_host_key").expect("deleting nothing succeeds");
}

#[test]
fn host_secrets_refuse_every_other_name_before_the_backend() {
    let backend = MemoryBackend::new();
    let page_key = SecretName::parse("serve_password").expect("a valid name");
    backend.set(&page_key, VALUE).expect("seed");
    set_secret(&backend, "provider_anthropic", VALUE).expect("seed");
    set_token(&backend, "google_refresh_acme", VALUE).expect("seed");

    let others = [
        "token_key",
        "serve_password",
        "provider_anthropic",
        "halonic_token_google_refresh_acme",
    ];
    for name in others {
        assert_eq!(
            get_host_secret(&backend, name),
            Err(SecretError::ReservedName),
            "{name}"
        );
        assert_eq!(
            set_host_secret(&backend, name, VALUE),
            Err(SecretError::ReservedName),
            "{name}"
        );
        assert_eq!(
            delete_host_secret(&backend, name),
            Err(SecretError::ReservedName),
            "{name}"
        );
    }
    assert_eq!(backend.get(&page_key), Ok(Some(VALUE.to_owned())));
    assert_eq!(
        get_host_secret(&backend, "not a name"),
        Err(SecretError::InvalidName)
    );
}

#[test]
fn host_secrets_refuse_empty_and_oversized_values() {
    let backend = MemoryBackend::new();
    assert_eq!(
        set_host_secret(&backend, "remote_host_key", ""),
        Err(SecretError::InvalidValue)
    );
    let oversized = "x".repeat(16 * 1024 + 1);
    assert_eq!(
        set_host_secret(&backend, "remote_host_key", &oversized),
        Err(SecretError::InvalidValue)
    );
    assert_eq!(get_host_secret(&backend, "remote_host_key"), Ok(None));
}

#[test]
fn host_secrets_are_reserved_from_the_page() {
    for name in HOST_NAMES {
        assert!(HALONIC_NAMES.contains(&name), "{name}");
        assert_eq!(
            set_secret(&MemoryBackend::new(), name, VALUE),
            Err(SecretError::ReservedName),
            "{name}"
        );
    }
}
