//! Targets with no desktop keychain, such as Android, where the shell uses
//! the Android Keystore instead (HAL-1211). keyring isn't built here, so
//! its mock store can't be either: every call is `unavailable`.

use halonic_secrets::{SecretBackend, SecretError, SecretName};

use crate::DesktopKeychain;

impl SecretBackend for DesktopKeychain {
    fn get(&self, _name: &SecretName) -> Result<Option<String>, SecretError> {
        Err(SecretError::Unavailable)
    }

    fn set(&self, _name: &SecretName, _value: &str) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }

    fn delete(&self, _name: &SecretName) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }
}

#[cfg(test)]
mod tests {
    use halonic_secrets::{delete_secret, get_secret, set_secret};

    use super::*;

    #[test]
    fn desktop_keychain_is_unavailable_on_other_targets() {
        let keychain = DesktopKeychain::new();
        assert_eq!(
            get_secret(&keychain, "acme-key"),
            Err(SecretError::Unavailable)
        );
        assert_eq!(
            set_secret(&keychain, "acme-key", "value"),
            Err(SecretError::Unavailable)
        );
        assert_eq!(
            delete_secret(&keychain, "acme-key"),
            Err(SecretError::Unavailable)
        );
    }
}
