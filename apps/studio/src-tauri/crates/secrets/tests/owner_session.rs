//! Owner server sessions (HAL-18944, RO-15): the shell keeps them in Rust,
//! and no command the page, the engine or the agent host reaches can read,
//! change or remove one.

use halonic_secrets::{
    MemoryBackend, SecretBackend, SecretError, SecretName, delete_host_secret, delete_secret,
    delete_token, get_host_secret, get_secret, get_token, has_secret, set_secret, set_token,
};

const KEY: &str = "0123456789abcdef0123456789abcdef";
const VALUE: &str = "a-test-session-not-a-real-one";

#[test]
fn owner_sessions_are_out_of_reach_of_secret_get_and_token_get() {
    let backend = MemoryBackend::new();
    let stored = SecretName::owner_session(KEY).expect("a session name");
    assert!(stored.is_halonic());
    backend.set(&stored, VALUE).expect("the shell stores it");
    for name in [
        stored.as_str(),
        "owner-session__0123456789abcdef0123456789abcdef",
        "OWNER_SESSION__0123456789ABCDEF0123456789ABCDEF",
    ] {
        let reserved: Result<(), SecretError> = Err(SecretError::ReservedName);
        let answers = [
            get_secret(&backend, name).map(|_| ()),
            get_token(&backend, name).map(|_| ()),
            has_secret(&backend, name).map(|_| ()),
            set_secret(&backend, name, "x"),
            set_token(&backend, name, "x"),
            delete_secret(&backend, name),
            delete_token(&backend, name),
            get_host_secret(&backend, name).map(|_| ()),
            delete_host_secret(&backend, name),
        ];
        for answer in answers {
            assert_eq!(answer, reserved, "{name}");
        }
    }
    assert_eq!(backend.get(&stored), Ok(Some(VALUE.into())));
}

#[test]
fn owner_sessions_are_named_from_a_hex_key_only() {
    let name = SecretName::owner_session(KEY).expect("a session name");
    assert_eq!(name.as_str(), format!("owner_session__{KEY}"));
    for key in [
        "",
        "0123456789abcdef",
        "0123456789ABCDEF0123456789ABCDEF",
        "0123456789abcdef0123456789abcdeg",
        "0123456789abcdef0123456789abcdef0",
    ] {
        assert_eq!(
            SecretName::owner_session(key),
            Err(SecretError::InvalidName),
            "{key:?}"
        );
    }
}
