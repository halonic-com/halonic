//! What the `secret_*` commands do, against the in-memory backend.

use halonic_secrets::{
    MAX_VALUE_BYTES, MemoryBackend, SecretBackend, SecretError, SecretName, check_backend_contract,
    delete_secret, get_secret, set_secret,
};

#[test]
fn secret_commands_pass_the_backend_contract_in_memory() {
    assert_eq!(check_backend_contract(&MemoryBackend::new()), Ok(()));
}

#[test]
fn secret_commands_refuse_bad_names_before_the_backend() {
    let backend = MemoryBackend::new();
    for name in ["", "1password", "provider.anthropic", "api key"] {
        assert_eq!(
            get_secret(&backend, name),
            Err(SecretError::InvalidName),
            "{name:?}"
        );
        assert_eq!(
            set_secret(&backend, name, "value"),
            Err(SecretError::InvalidName),
            "{name:?}"
        );
        assert_eq!(
            delete_secret(&backend, name),
            Err(SecretError::InvalidName),
            "{name:?}"
        );
    }
}

#[test]
fn secret_commands_refuse_empty_and_oversized_values() {
    let backend = MemoryBackend::new();
    assert_eq!(
        set_secret(&backend, "acme-key", ""),
        Err(SecretError::InvalidValue)
    );
    let too_long = "x".repeat(MAX_VALUE_BYTES + 1);
    assert_eq!(
        set_secret(&backend, "acme-key", &too_long),
        Err(SecretError::InvalidValue)
    );
    assert_eq!(get_secret(&backend, "acme-key"), Ok(None));
}

#[test]
fn secret_commands_refuse_values_longer_than_the_backend_keeps() {
    let backend = SmallBackend(MemoryBackend::new());
    assert_eq!(
        set_secret(&backend, "acme-key", &"x".repeat(SMALL_LIMIT + 1)),
        Err(SecretError::InvalidValue)
    );
    assert_eq!(get_secret(&backend, "acme-key"), Ok(None));
    assert_eq!(check_backend_contract(&backend), Ok(()));
}

#[test]
fn secret_commands_contract_fails_a_backend_that_keeps_more_than_it_says() {
    // A backend that says it keeps 16 KiB but cuts values short fails the
    // largest-value case.
    let backend = CuttingBackend(MemoryBackend::new());
    let failure = check_backend_contract(&backend).expect_err("values come back cut");
    assert!(failure.starts_with("the largest value"), "{failure}");
}

#[test]
fn secret_commands_never_put_the_value_in_an_error() {
    let value = "acme-secret-value";
    let backend = FailingBackend;
    let errors = [
        set_secret(&backend, "acme-key", value).expect_err("the backend fails"),
        set_secret(&backend, "bad name", value).expect_err("the name is bad"),
        set_secret(
            &backend,
            "acme-key",
            &format!("{value}{}", "x".repeat(MAX_VALUE_BYTES)),
        )
        .expect_err("too long"),
    ];
    for error in errors {
        assert!(!error.to_string().contains(value), "{error}");
    }
}

#[test]
fn secret_commands_name_every_error_kind() {
    let kinds = [
        SecretError::InvalidName,
        SecretError::InvalidValue,
        SecretError::Unavailable,
        SecretError::Denied,
        SecretError::Unreadable,
        SecretError::Backend {
            message: String::new(),
        },
    ]
    .map(|error| error.kind());
    assert_eq!(
        kinds,
        [
            "invalid_name",
            "invalid_value",
            "unavailable",
            "denied",
            "unreadable",
            "backend"
        ]
    );
}

/// A backend whose every call fails, to look at the error messages.
struct FailingBackend;

impl SecretBackend for FailingBackend {
    fn get(&self, _name: &SecretName) -> Result<Option<String>, SecretError> {
        Err(SecretError::Unavailable)
    }

    fn set(&self, name: &SecretName, _value: &str) -> Result<(), SecretError> {
        Err(SecretError::Backend {
            message: format!("could not write {}", name.as_str()),
        })
    }

    fn delete(&self, _name: &SecretName) -> Result<(), SecretError> {
        Err(SecretError::Denied)
    }
}

/// The limit of [`SmallBackend`], the Windows Credential Manager's.
const SMALL_LIMIT: usize = 1280;

/// A backend that keeps short values only, like the Windows Credential
/// Manager.
struct SmallBackend(MemoryBackend);

impl SecretBackend for SmallBackend {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.0.get(name)
    }

    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        assert!(value.len() <= SMALL_LIMIT, "set_secret checks the limit");
        self.0.set(name, value)
    }

    fn delete(&self, name: &SecretName) -> Result<(), SecretError> {
        self.0.delete(name)
    }

    fn max_value_bytes(&self) -> usize {
        SMALL_LIMIT
    }
}

/// A backend that keeps only the first 1,000 bytes of a value.
struct CuttingBackend(MemoryBackend);

impl SecretBackend for CuttingBackend {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.0.get(name)
    }

    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        self.0.set(name, &value[..value.len().min(1000)])
    }

    fn delete(&self, name: &SecretName) -> Result<(), SecretError> {
        self.0.delete(name)
    }
}
