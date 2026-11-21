use crate::backend::{SecretBackend, check_value_fits};
use crate::error::SecretError;
use crate::name::SecretName;

/// A name the agent host's secrets channel may reach: one of
/// [`crate::HOST_NAMES`] in any spelling the name rule accepts. Every other
/// name is refused as [`SecretError::ReservedName`], so the host can't read
/// `serve_password`, a token or a workspace's key, whatever it sends.
fn host_name(name: &str) -> Result<SecretName, SecretError> {
    let name = SecretName::parse(name)?;
    if !name.is_host() {
        return Err(SecretError::ReservedName);
    }
    Ok(name)
}

/// What the host's `get` does: checks the name, then reads.
pub fn get_host_secret(
    backend: &dyn SecretBackend,
    name: &str,
) -> Result<Option<String>, SecretError> {
    backend.get(&host_name(name)?)
}

/// What the host's `set` does: checks the name and the value, then writes.
pub fn set_host_secret(
    backend: &dyn SecretBackend,
    name: &str,
    value: &str,
) -> Result<(), SecretError> {
    let name = host_name(name)?;
    check_value_fits(backend, value)?;
    backend.set(&name, value)
}

/// What the host's `delete` does: checks the name, then removes the value.
/// Removing a name that holds nothing succeeds. The host's names never have
/// allowed origins, so there are none to remove.
pub fn delete_host_secret(backend: &dyn SecretBackend, name: &str) -> Result<(), SecretError> {
    backend.delete(&host_name(name)?)
}
