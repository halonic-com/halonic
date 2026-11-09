//! The keychain on macOS, Windows and Linux, through `keyring`.

use halonic_secrets::{SERVICE, SecretBackend, SecretError, SecretName};
use keyring::{Entry, Error};

use crate::DesktopKeychain;

/// The platform's own credential type. Naming it, rather than calling
/// `Entry::new`, keeps keyring's mock store out: `Entry::new` uses whatever
/// store keyring was built with, and that is the mock when a feature is
/// missing.
#[cfg(target_os = "linux")]
pub(crate) type PlatformCredential = keyring::secret_service::SsCredential;
#[cfg(target_os = "macos")]
pub(crate) type PlatformCredential = keyring::macos::MacCredential;
#[cfg(target_os = "windows")]
pub(crate) type PlatformCredential = keyring::windows::WinCredential;

/// The Windows Credential Manager keeps at most 2,560 bytes per entry, and
/// keyring stores the value there as UTF-16, two bytes per unit. A UTF-8
/// value of 1,280 bytes has at most 1,280 UTF-16 units, so it always fits.
/// The Keychain and the Secret Service keep the full 16 KiB.
#[cfg(target_os = "windows")]
pub(crate) const MAX_STORED_BYTES: usize = 1280;
#[cfg(not(target_os = "windows"))]
pub(crate) const MAX_STORED_BYTES: usize = halonic_secrets::MAX_VALUE_BYTES;

/// What a store that can't be reached means. macOS and Windows report a
/// keychain that isn't there (no keychain, no logon session); the Secret
/// Service reports one that is locked, or whose unlock prompt the user
/// dismissed.
#[cfg(target_os = "linux")]
pub(crate) const NO_ACCESS: SecretError = SecretError::Denied;
#[cfg(not(target_os = "linux"))]
pub(crate) const NO_ACCESS: SecretError = SecretError::Unavailable;

/// The keychain entry for a name: service `halonic`, user the canonical
/// name. Making it touches no keychain.
pub(crate) fn entry(name: &SecretName) -> Result<Entry, SecretError> {
    let credential =
        PlatformCredential::new_with_target(None, SERVICE, name.as_str()).map_err(secret_error)?;
    Ok(Entry::new_with_credential(Box::new(credential)))
}

impl SecretBackend for DesktopKeychain {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        let entry = entry(name)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(Error::NoEntry) => Ok(None),
            // Something else wrote bytes that aren't text under our name.
            // Remove them, so the app can ask for the secret again.
            Err(Error::BadEncoding(_)) => {
                delete_entry(&entry)?;
                Err(SecretError::Unreadable)
            }
            Err(error) => Err(secret_error(error)),
        }
    }

    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        entry(name)?.set_password(value).map_err(secret_error)
    }

    fn delete(&self, name: &SecretName) -> Result<(), SecretError> {
        delete_entry(&entry(name)?)
    }

    fn max_value_bytes(&self) -> usize {
        MAX_STORED_BYTES
    }
}

/// Removes an entry. An entry that isn't there is already removed.
fn delete_entry(entry: &Entry) -> Result<(), SecretError> {
    match entry.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(secret_error(error)),
    }
}

/// Turns a keyring error into one of the shell's kinds, without the value.
///
/// keyring's messages hold no value, with two exceptions: `BadEncoding`
/// carries the stored bytes and `Ambiguous` prints the matching entries.
/// Neither message is passed on.
pub(crate) fn secret_error(error: Error) -> SecretError {
    match error {
        Error::NoStorageAccess(_) => NO_ACCESS,
        Error::BadEncoding(_) => SecretError::Unreadable,
        // Names are at most 128 characters, far below every platform's
        // limit, so only a value can be too long.
        Error::TooLong(..) => SecretError::InvalidValue,
        Error::Ambiguous(_) => SecretError::Backend {
            message: "more than one keychain entry matches the name".to_owned(),
        },
        other => SecretError::Backend {
            message: other.to_string(),
        },
    }
}
