//! What the `token_*` commands do, against the in-memory backend.

use halonic_secrets::{
    MAX_NAME_LENGTH, MAX_VALUE_BYTES, MemoryBackend, SecretBackend, SecretError, SecretName,
    TOKEN_PREFIX, delete_token, get_secret, get_token, set_token,
};

#[test]
fn token_commands_keep_a_token_under_the_token_prefix() {
    let backend = MemoryBackend::new();
    assert_eq!(get_token(&backend, "google_refresh_acme"), Ok(None));
    set_token(&backend, "Google-Refresh-Acme", "acme-token-value").expect("stores");
    assert_eq!(
        get_token(&backend, "google_refresh_acme"),
        Ok(Some("acme-token-value".into()))
    );
    // The same entry the page's token store wrote before the token commands.
    let entry = SecretName::parse("halonic_token_google_refresh_acme").expect("a valid name");
    assert_eq!(backend.get(&entry), Ok(Some("acme-token-value".into())));
    delete_token(&backend, "google_refresh_acme").expect("removes");
    assert_eq!(get_token(&backend, "google_refresh_acme"), Ok(None));
    assert_eq!(delete_token(&backend, "google_refresh_acme"), Ok(()));
}

#[test]
fn token_commands_never_reach_a_secret_of_the_same_name() {
    let backend = MemoryBackend::new();
    let secret = SecretName::parse("acme_key").expect("a valid name");
    backend.set(&secret, "secret-value").expect("stores");
    assert_eq!(get_token(&backend, "acme_key"), Ok(None));
    set_token(&backend, "acme_key", "token-value").expect("stores");
    assert_eq!(
        get_secret(&backend, "acme_key"),
        Ok(Some("secret-value".into()))
    );
}

#[test]
fn token_commands_refuse_bad_and_too_long_names_before_the_backend() {
    let backend = MemoryBackend::new();
    let longest = "a".repeat(MAX_NAME_LENGTH - TOKEN_PREFIX.len());
    set_token(&backend, &longest, "value").expect("the longest name fits");
    let too_long = format!("{longest}a");
    for name in ["", "1token", "google.refresh", too_long.as_str()] {
        assert_eq!(
            get_token(&backend, name),
            Err(SecretError::InvalidName),
            "{name:?}"
        );
        assert_eq!(
            set_token(&backend, name, "value"),
            Err(SecretError::InvalidName),
            "{name:?}"
        );
        assert_eq!(
            delete_token(&backend, name),
            Err(SecretError::InvalidName),
            "{name:?}"
        );
    }
}

#[test]
fn token_commands_refuse_empty_and_oversized_values() {
    let backend = MemoryBackend::new();
    assert_eq!(
        set_token(&backend, "google_refresh", ""),
        Err(SecretError::InvalidValue)
    );
    let too_long = "x".repeat(MAX_VALUE_BYTES + 1);
    assert_eq!(
        set_token(&backend, "google_refresh", &too_long),
        Err(SecretError::InvalidValue)
    );
    assert_eq!(get_token(&backend, "google_refresh"), Ok(None));
}
