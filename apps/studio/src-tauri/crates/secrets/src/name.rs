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

    /// The keychain name of the token `name`: [`TOKEN_PREFIX`] and the
    /// token's canonical name, at most 128 characters in all. The page's
    /// `TokenStore` adds the same prefix (`tokenNamePrefix` in
    /// `@halonicjs/ports`), so tokens stored before the token commands are
    /// found under the same entry.
    pub fn token(name: &str) -> Result<Self, SecretError> {
        let token = Self::parse(name)?;
        if TOKEN_PREFIX.len() + token.0.len() > MAX_NAME_LENGTH {
            return Err(SecretError::InvalidName);
        }
        Ok(Self(format!("{TOKEN_PREFIX}{}", token.0)))
    }

    /// Whether the name belongs to Halonic: one of [`HALONIC_NAMES`] or a
    /// token under [`TOKEN_PREFIX`]. The same rule as `isHalonicSecretName`
    /// in `@halonicjs/ports`.
    pub fn is_halonic(&self) -> bool {
        HALONIC_NAMES.contains(&self.0.as_str()) || self.0.starts_with(TOKEN_PREFIX)
    }

    /// The canonical name, which is what the keychain stores.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// The canonical prefix of every token's keychain name.
pub const TOKEN_PREFIX: &str = "halonic_token_";

/// Halonic's own secrets, in canonical form: the key the CLI seals its
/// tokens with, the hash of the served Studio's sign-in password and the
/// agent host's static key that paired phones pin. The same names as
/// `halonicSecretNames` and `hostSecretNames` in `@halonicjs/ports`; both
/// sides check their list against `tests/fixtures/reserved-names.txt`.
pub const HALONIC_NAMES: [&str; 3] = ["token_key", "serve_password", "remote_host_key"];
