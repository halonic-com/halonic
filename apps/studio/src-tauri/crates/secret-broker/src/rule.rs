use halonic_secrets::{SecretError, SecretName};

/// The canonical prefix of every plugin secret, `plugin__<id>__<name>`.
/// Plugin backends run in the agent host, so the engine never gets one
/// (HAL-13652 plans their own path).
pub const PLUGIN_PREFIX: &str = "plugin__";

/// A name the engine may read as a workspace secret: one that passes the
/// name rule, isn't one of Halonic's own ([`SecretName::is_halonic`], so
/// the token store key, the `serve` password and every token), and isn't a
/// plugin's.
///
/// The rule is checked on the canonical name, so `Plugin--acme--key` is
/// refused as `plugin__acme__key` is, and a name Halonic reserves later is
/// refused here as soon as `is_halonic` covers it.
pub fn engine_secret_name(name: &str) -> Result<SecretName, SecretError> {
    let name = SecretName::parse(name)?;
    if name.is_halonic() || name.as_str().starts_with(PLUGIN_PREFIX) {
        return Err(SecretError::ReservedName);
    }
    Ok(name)
}
