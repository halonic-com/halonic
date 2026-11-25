//! Where a stepper's sign-in is kept: the token in the OS keychain under
//! `action__<service>__<account>`, and beside it, under `action__<service>`,
//! which account that is and when its token expires (architecture note on
//! HAL-17491, 3). The `action__` names are reserved in `halonic-secrets`,
//! so the page's secret commands can't reach either.

use halonic_secrets::{SecretBackend, SecretError, SecretName, check_value};
use serde::{Deserialize, Serialize};

/// The longest account name: GitHub's limit for a login.
pub const MAX_ACCOUNT_CHARS: usize = 39;

/// The account the user is signed in to a service with: `ActionAccount` in
/// `@halonicjs/ports`. Its name only, never a token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Account {
    pub service: String,
    pub name: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct AccountRecord {
    account: String,
    /// Seconds since 1970 when the token stops working.
    expires: u64,
}

/// Whether `name` can be an account name: letters, digits and `-`, not
/// starting with `-`, at most [`MAX_ACCOUNT_CHARS`].
pub fn is_account_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_ACCOUNT_CHARS
        && !name.starts_with('-')
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn record_name(service: &str) -> Result<SecretName, SecretError> {
    SecretName::parse(&format!("action__{service}"))
}

fn token_name(service: &str, account: &str) -> Result<SecretName, SecretError> {
    if !is_account_name(account) {
        return Err(SecretError::InvalidName);
    }
    SecretName::parse(&format!("action__{service}__{account}"))
}

fn read_record(
    backend: &dyn SecretBackend,
    service: &str,
) -> Result<Option<AccountRecord>, SecretError> {
    let Some(text) = backend.get(&record_name(service)?)? else {
        return Ok(None);
    };
    // A record the shell can't read counts as signed out; the next sign-in
    // replaces it.
    Ok(serde_json::from_str::<AccountRecord>(&text)
        .ok()
        .filter(|record| is_account_name(&record.account)))
}

/// The account signed in to the service, or `None` when nobody is or its
/// token has expired.
pub fn signed_in(
    backend: &dyn SecretBackend,
    service: &str,
    now: u64,
) -> Result<Option<Account>, SecretError> {
    Ok(read_record(backend, service)?
        .filter(|record| record.expires > now)
        .map(|record| Account {
            service: service.to_owned(),
            name: record.account,
        }))
}

/// The signed-in account and its token, or `None` when there is no usable
/// one. The token stays in the shell: the caller puts it in one header.
pub fn token(
    backend: &dyn SecretBackend,
    service: &str,
    now: u64,
) -> Result<Option<(Account, String)>, SecretError> {
    let Some(account) = signed_in(backend, service, now)? else {
        return Ok(None);
    };
    let token = backend.get(&token_name(service, &account.name)?)?;
    Ok(token.map(|token| (account, token)))
}

/// Stores a new sign-in: the token first, then the record that points at
/// it, so a failure halfway never leaves a record without its token.
pub fn store(
    backend: &dyn SecretBackend,
    service: &str,
    account: &str,
    token: &str,
    expires: u64,
) -> Result<(), SecretError> {
    check_value(token)?;
    let previous = read_record(backend, service)?;
    backend.set(&token_name(service, account)?, token)?;
    let record = serde_json::to_string(&AccountRecord {
        account: account.to_owned(),
        expires,
    })
    .map_err(|error| SecretError::Backend {
        message: error.to_string(),
    })?;
    backend.set(&record_name(service)?, &record)?;
    // Another account's older token isn't needed any more.
    match previous {
        Some(old) if old.account != account => backend.delete(&token_name(service, &old.account)?),
        _ => Ok(()),
    }
}

/// Forgets the service's sign-in: the token first, then the record. Doing
/// nothing when nobody is signed in.
pub fn sign_out(backend: &dyn SecretBackend, service: &str) -> Result<(), SecretError> {
    if let Some(record) = read_record(backend, service)? {
        backend.delete(&token_name(service, &record.account)?)?;
    }
    backend.delete(&record_name(service)?)
}
