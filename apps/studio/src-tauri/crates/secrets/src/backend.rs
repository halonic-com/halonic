use crate::error::SecretError;
use crate::name::SecretName;

/// The most bytes a secret's value may have.
pub const MAX_VALUE_BYTES: usize = 16 * 1024;

/// The service every keychain entry is stored under (plan 3.3). The CLI
/// uses the same service, so both see the same secrets. The old app used
/// `ai-studio`, so it never sees these.
pub const SERVICE: &str = "halonic";

/// Where secrets are kept: the OS keychain on desktop, the Android
/// Keystore on Android, memory in tests.
///
/// A backend receives names that are already canonical and values that
/// already passed [`check_value`]; the functions [`get_secret`],
/// [`set_secret`] and [`delete_secret`] see to that. It holds no desktop
/// types, so the Android backend can implement it with only a plugin
/// handle.
pub trait SecretBackend: Send + Sync {
    /// The value, or `None` when nothing is stored under the name.
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError>;

    /// Stores the value, replacing any value already there.
    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError>;

    /// Removes the value. Removing a name that holds nothing succeeds.
    fn delete(&self, name: &SecretName) -> Result<(), SecretError>;
}

/// Checks a value: not empty and at most [`MAX_VALUE_BYTES`] bytes. A Rust
/// `&str` is always UTF-8, so that rule holds by type.
pub fn check_value(value: &str) -> Result<(), SecretError> {
    if value.is_empty() || value.len() > MAX_VALUE_BYTES {
        return Err(SecretError::InvalidValue);
    }
    Ok(())
}

/// What `secret_get` does: checks the name, then reads.
pub fn get_secret(backend: &dyn SecretBackend, name: &str) -> Result<Option<String>, SecretError> {
    backend.get(&SecretName::parse(name)?)
}

/// What `secret_set` does: checks the name and the value, then writes.
pub fn set_secret(backend: &dyn SecretBackend, name: &str, value: &str) -> Result<(), SecretError> {
    let name = SecretName::parse(name)?;
    check_value(value)?;
    backend.set(&name, value)
}

/// What `secret_delete` does: checks the name, then removes.
pub fn delete_secret(backend: &dyn SecretBackend, name: &str) -> Result<(), SecretError> {
    backend.delete(&SecretName::parse(name)?)
}
