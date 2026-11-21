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
/// [`has_secret`], [`set_secret`] and [`delete_secret`], the token ones and
/// the origin ones see to that. It holds no desktop
/// types, so the Android backend can implement it with only a plugin
/// handle.
pub trait SecretBackend: Send + Sync {
    /// The value, or `None` when nothing is stored under the name.
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError>;

    /// Whether a value is stored under the name. The answer is only yes or
    /// no: the default reads inside the shell and drops the value there, and
    /// a backend that can ask its store without reading may override it.
    fn has(&self, name: &SecretName) -> Result<bool, SecretError> {
        Ok(self.get(name)?.is_some())
    }

    /// Stores the value, replacing any value already there.
    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError>;

    /// Removes the value. Removing a name that holds nothing succeeds.
    fn delete(&self, name: &SecretName) -> Result<(), SecretError>;

    /// The stored list of origins the key may be sent to, as text, or `None`
    /// when none is recorded. It is kept apart from the value, so
    /// [`SecretBackend::set`] never changes it; [`crate::allowed_origins`]
    /// reads it.
    fn get_origins(&self, name: &SecretName) -> Result<Option<String>, SecretError>;

    /// Stores the list of origins, replacing any list already there.
    /// [`crate::allow_origin`] writes it, checked and no longer than
    /// [`SecretBackend::max_value_bytes`].
    fn set_origins(&self, name: &SecretName, origins: &str) -> Result<(), SecretError>;

    /// Removes the list of origins. Removing a list that isn't there
    /// succeeds.
    fn delete_origins(&self, name: &SecretName) -> Result<(), SecretError>;

    /// The longest value this backend can keep, in bytes. A store that holds
    /// less than [`MAX_VALUE_BYTES`] (the Windows Credential Manager) says so
    /// here, so [`set_secret`] refuses a longer value before the backend
    /// runs.
    fn max_value_bytes(&self) -> usize {
        MAX_VALUE_BYTES
    }
}

/// Checks a value: not empty and at most [`MAX_VALUE_BYTES`] bytes. A Rust
/// `&str` is always UTF-8, so that rule holds by type.
pub fn check_value(value: &str) -> Result<(), SecretError> {
    if value.is_empty() || value.len() > MAX_VALUE_BYTES {
        return Err(SecretError::InvalidValue);
    }
    Ok(())
}

/// Checks a value for one backend: [`check_value`], and no longer than the
/// backend can keep.
pub(crate) fn check_value_fits(
    backend: &dyn SecretBackend,
    value: &str,
) -> Result<(), SecretError> {
    check_value(value)?;
    if value.len() > backend.max_value_bytes() {
        return Err(SecretError::InvalidValue);
    }
    Ok(())
}

/// A name the secret commands may reach: one that passes the name rule and
/// doesn't belong to Halonic. Halonic's own secrets and its tokens are
/// refused here, in the shell, so a page that calls the commands directly
/// can't read or change them; tokens go through the token commands.
pub(crate) fn secret_name(name: &str) -> Result<SecretName, SecretError> {
    let name = SecretName::parse(name)?;
    if name.is_halonic() {
        return Err(SecretError::ReservedName);
    }
    Ok(name)
}

/// What `secret_get` does: checks the name, then reads.
pub fn get_secret(backend: &dyn SecretBackend, name: &str) -> Result<Option<String>, SecretError> {
    backend.get(&secret_name(name)?)
}

/// What `secret_has` does: checks the name, then answers whether a value is
/// stored. The value never leaves the backend call.
pub fn has_secret(backend: &dyn SecretBackend, name: &str) -> Result<bool, SecretError> {
    backend.has(&secret_name(name)?)
}

/// What `secret_set` does: checks the name and the value, then writes. The
/// key's allowed origins stay: a new value for a key must not unbind it.
pub fn set_secret(backend: &dyn SecretBackend, name: &str, value: &str) -> Result<(), SecretError> {
    let name = secret_name(name)?;
    check_value_fits(backend, value)?;
    backend.set(&name, value)
}

/// What `secret_delete` does: checks the name, then removes the key's
/// allowed origins and then the value. In that order, a failure halfway
/// leaves a key with no origins, which the older trust rule covers, and
/// never a list that a new key under the same name would take over.
pub fn delete_secret(backend: &dyn SecretBackend, name: &str) -> Result<(), SecretError> {
    let name = secret_name(name)?;
    backend.delete_origins(&name)?;
    backend.delete(&name)
}

/// What `token_get` does: reads the token `name`, stored under
/// [`SecretName::token`].
pub fn get_token(backend: &dyn SecretBackend, name: &str) -> Result<Option<String>, SecretError> {
    backend.get(&SecretName::token(name)?)
}

/// What `token_set` does: checks the token's name and value, then writes.
pub fn set_token(backend: &dyn SecretBackend, name: &str, value: &str) -> Result<(), SecretError> {
    let name = SecretName::token(name)?;
    check_value_fits(backend, value)?;
    backend.set(&name, value)
}

/// What `token_delete` does: removes the token. Removing a token that isn't
/// stored succeeds.
pub fn delete_token(backend: &dyn SecretBackend, name: &str) -> Result<(), SecretError> {
    backend.delete(&SecretName::token(name)?)
}
