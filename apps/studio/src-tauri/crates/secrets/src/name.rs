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
        if token.0.starts_with(SERVER_PAIRING_PREFIX) || token.0.starts_with(OWNER_SESSION_PREFIX) {
            return Err(SecretError::ReservedName);
        }
        if TOKEN_PREFIX.len() + token.0.len() > MAX_NAME_LENGTH {
            return Err(SecretError::InvalidName);
        }
        Ok(Self(format!("{TOKEN_PREFIX}{}", token.0)))
    }

    /// The keychain name of the everyday key of the Paperclip connection
    /// `connection` (HAL-20278): the token `paperclip-<connection>`, the
    /// same entry the page wrote before the shell kept the key, so an entry
    /// stored then is found without a migration. Only the shell's own
    /// Paperclip code builds it (`halonic-agent-host`'s `paperclip_keep`).
    pub fn paperclip_key(connection: &str) -> Result<Self, SecretError> {
        let token = Self::parse(&format!("{PAPERCLIP_KEY_TOKEN}{connection}"))?;
        if TOKEN_PREFIX.len() + token.0.len() > MAX_NAME_LENGTH {
            return Err(SecretError::InvalidName);
        }
        Ok(Self(format!("{TOKEN_PREFIX}{}", token.0)))
    }

    /// Whether the name belongs to Halonic: one of [`HALONIC_NAMES`], a
    /// token under [`TOKEN_PREFIX`], a stepper's sign-in under
    /// [`ACTION_PREFIX`], a server pairing under [`SERVER_PAIRING_PREFIX`] or
    /// an owner server's session under [`OWNER_SESSION_PREFIX`].
    /// The same rule as `isHalonicSecretName` in `@halonicjs/ports`, which
    /// doesn't know the stepper prefix yet: a workspace secret named like one
    /// is refused here. The canonical form folds case and `-`, so every
    /// spelling of a prefix counts, as Windows matches credential names
    /// without case.
    pub fn is_halonic(&self) -> bool {
        HALONIC_NAMES.contains(&self.0.as_str())
            || self.0.starts_with(TOKEN_PREFIX)
            || self.0.starts_with(ACTION_PREFIX)
            || self.0.starts_with(SERVER_PAIRING_PREFIX)
            || self.0.starts_with(OWNER_SESSION_PREFIX)
    }

    /// The keychain name of the session the shell keeps for one owner
    /// server: [`OWNER_SESSION_PREFIX`] and `key`, exactly 32 lower-case hex
    /// digits that the caller derives from the server's origin. Only the
    /// shell's `owner_*` commands build it; the page's commands refuse it.
    pub fn owner_session(key: &str) -> Result<Self, SecretError> {
        let is_key = key.len() == 32
            && key
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
        if !is_key {
            return Err(SecretError::InvalidName);
        }
        Ok(Self(format!("{OWNER_SESSION_PREFIX}{key}")))
    }

    /// Whether the agent host may reach the name through its secrets
    /// channel: one of [`HOST_NAMES`]. A server pairing is reachable too, but
    /// only in its exact form, which the canonical form can't tell apart, so
    /// the channel checks [`is_server_pairing_name`] on the name it was sent.
    pub fn is_host(&self) -> bool {
        HOST_NAMES.contains(&self.0.as_str())
    }

    /// The canonical name, which is what the keychain stores.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// The canonical prefix of every token's keychain name.
pub const TOKEN_PREFIX: &str = "halonic_token_";

/// The token name a Paperclip connection's everyday key is kept under,
/// before the connection's name ([`SecretName::paperclip_key`]).
const PAPERCLIP_KEY_TOKEN: &str = "paperclip-";

/// The canonical prefix of a stepper's sign-in:the user's own token for a
/// service and the account it belongs to (`halonic-action-send`). Only the
/// shell's `action_*` commands reach these; the secret commands, the agent
/// host and the engine never do, so no page, agent or integration sees the
/// token.
pub const ACTION_PREFIX: &str = "action__";

/// The canonical prefix of a workspace's server pairing: the device token
/// the server gave this computer for one workspace (HAL-18501). Only the
/// agent host reaches these, through its secrets channel and only in the
/// exact form [`is_server_pairing_name`] accepts; the page's secret and
/// token commands refuse every spelling of the prefix.
pub const SERVER_PAIRING_PREFIX: &str = "server_pairing__";

/// The canonical prefix of the session the shell keeps for an owner server
/// it signed in to with the server's password (HAL-18944). Only the shell's
/// `owner_*` commands reach these, in Rust: the page's secret and token
/// commands, the engine and the agent host never do, so no page or agent
/// sees the session.
pub const OWNER_SESSION_PREFIX: &str = "owner_session__";

/// Whether `name`, as the host sent it, is a server pairing's name in its
/// one exact form: `server-pairing__` and the workspace's key, exactly 32
/// lower-case hex digits. Nothing is folded or trimmed, so
/// `Server-Pairing__…`, `server_pairing__…` and upper-case hex are not
/// pairing names. The same rule as `isServerPairingSecretName` in
/// `@halonicjs/ports`; both sides check it against
/// `tests/fixtures/server-pairing-names.tsv`.
pub fn is_server_pairing_name(name: &str) -> bool {
    name.strip_prefix("server-pairing__").is_some_and(|key| {
        key.len() == 32
            && key
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

/// Halonic's own secrets, in canonical form: the key the CLI seals its
/// tokens with, the hash of the served Studio's sign-in password and the
/// agent host's static key that paired phones pin. The same names as
/// `halonicSecretNames` and `hostSecretNames` in `@halonicjs/ports`; both
/// sides check their list against `tests/fixtures/reserved-names.txt`.
pub const HALONIC_NAMES: [&str; 3] = ["token_key", "serve_password", "remote_host_key"];

/// The names of [`HALONIC_NAMES`] the agent host may get, set and delete
/// through its secrets channel to the shell (requirement `host-secrets`).
/// Only the ones it keeps in the keychain today: `token_key` joins once the
/// CLI can reach the keychain too (HAL-14148), and `serve_password` and the
/// tokens never do.
pub const HOST_NAMES: [&str; 1] = ["remote_host_key"];
