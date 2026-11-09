use crate::error::SecretError;

/// The longest name the `Secrets` port allows.
pub const MAX_NAME_LENGTH: usize = 128;

/// A secret's name in canonical form: lower case, with `-` turned into `_`
/// (requirement `secret-names`).
///
/// The `Secrets` port makes names that differ only in case, or in `-`
/// versus `_`, the same secret on every adapter. The CLI's token store
/// (`canonicalTokenName` in `packages/adapters/token-store`) uses the same
/// form, so the CLI and the app find the same keychain entry.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SecretName(String);

impl SecretName {
    /// Checks a name against the port's rule, `^[A-Za-z][A-Za-z0-9_-]*$`
    /// with at most 128 characters, and returns its canonical form.
    pub fn parse(name: &str) -> Result<Self, SecretError> {
        let mut bytes = name.bytes();
        let starts_with_a_letter = bytes.next().is_some_and(|byte| byte.is_ascii_alphabetic());
        let rest_is_allowed =
            bytes.all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-');
        if !starts_with_a_letter || !rest_is_allowed || name.len() > MAX_NAME_LENGTH {
            return Err(SecretError::InvalidName);
        }
        Ok(Self(name.to_ascii_lowercase().replace('-', "_")))
    }

    /// The canonical name, which is what the keychain stores.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}
