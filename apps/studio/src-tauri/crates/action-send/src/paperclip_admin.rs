//! The separate Paperclip admin key of rows C1 and C5 (architecture note on
//! HAL-17491, 2.4 and 6.8, condition 3; HAL-20275). It is kept apart from the
//! everyday key of row 15: its own keychain entries under the `action__`
//! prefix, which the page's `secret_*` commands refuse and its `token_*`
//! commands can't build, so no page command reads or writes them.
//!
//! Paperclip has no fixed origin: the user connects whatever address they
//! run. The shell takes it from the connection's own keychain entry, the one
//! `halonic-agent-host`'s `paperclip_keep` writes, never from the request or
//! the page, and reads only its `address` and `company`, never its `key`.
//! The admin key is stored against that origin and company, so a connection
//! that later names another address or company never gets the key sent
//! there: the key counts as signed out instead.

use std::net::IpAddr;

use halonic_secrets::{SecretBackend, SecretError, SecretName, check_value};
use serde::{Deserialize, Serialize};
use url::{Host, Url};

use crate::wipe::Wiped;

/// The longest a stored admin key is used, whatever happens to its stepper.
/// The shell signs it out when the stepper closes; this bounds a key a crash
/// left behind.
pub const ADMIN_KEY_SECONDS: u64 = 60 * 60;

/// The longest company id the shell takes from a connection's entry.
const MAX_COMPANY_CHARS: usize = 64;

/// Which Paperclip the admin key is for: the origin and company of one
/// connection, read from its keychain entry. Never its key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PaperclipConnection {
    /// The connection's name, as Studio's connection file names it.
    pub connection: String,
    /// `https://host[:port]`, or `http://` on a loopback address.
    pub origin: String,
    /// The company's id in Paperclip.
    pub company: String,
}

/// The fields of the connection's entry the shell reads. Any others,
/// the everyday `key` among them, are skipped without being kept.
#[derive(Deserialize)]
struct ConnectionEntry {
    address: String,
    company: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct AdminRecord {
    connection: String,
    origin: String,
    company: String,
    /// Paperclip's id of the board member who approved the sign-in.
    user: String,
    /// Seconds since 1970 when the shell stops using the key.
    expires: u64,
}

/// The origin of `address` when an admin key may be sent there: `https`, or
/// `http` on a loopback address for a server on this computer, with no
/// user, password, path, query or fragment beyond a bare `/`.
pub fn admin_origin(address: &str) -> Option<String> {
    let url = Url::parse(address).ok()?;
    let host = url.host()?;
    let allowed = match url.scheme() {
        "https" => true,
        "http" => is_loopback(&host),
        _ => false,
    };
    let bare = url.username().is_empty()
        && url.password().is_none()
        && url.path() == "/"
        && url.query().is_none()
        && url.fragment().is_none();
    (allowed && bare).then(|| url.origin().ascii_serialization())
}

fn is_loopback(host: &Host<&str>) -> bool {
    match host {
        Host::Domain(name) => name.eq_ignore_ascii_case("localhost"),
        Host::Ipv4(address) => IpAddr::V4(*address).is_loopback(),
        Host::Ipv6(address) => IpAddr::V6(*address).is_loopback(),
    }
}

fn is_company_id(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= MAX_COMPANY_CHARS
        && text
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

/// The connection `connection`'s origin and company, from its keychain
/// entry, or `None` when there is no entry, it can't be read, or its address
/// isn't one an admin key may go to.
pub fn connection_of(
    backend: &dyn SecretBackend,
    connection: &str,
) -> Result<Option<PaperclipConnection>, SecretError> {
    let Some(text) = backend.get(&SecretName::paperclip_key(connection)?)? else {
        return Ok(None);
    };
    // The entry's text holds the everyday key: wiped once it is read.
    let text = Wiped::text(text);
    let Ok(entry) = serde_json::from_str::<ConnectionEntry>(text.as_str()) else {
        return Ok(None);
    };
    let Some(origin) = admin_origin(&entry.address) else {
        return Ok(None);
    };
    Ok(is_company_id(&entry.company).then(|| PaperclipConnection {
        connection: connection.to_owned(),
        origin,
        company: entry.company,
    }))
}

fn record_name() -> Result<SecretName, SecretError> {
    SecretName::parse("action__paperclip")
}

fn key_name() -> Result<SecretName, SecretError> {
    SecretName::parse("action__paperclip__admin_key")
}

fn read_record(backend: &dyn SecretBackend) -> Result<Option<AdminRecord>, SecretError> {
    let Some(text) = backend.get(&record_name()?)? else {
        return Ok(None);
    };
    // A record the shell can't read counts as signed out; the next sign-in
    // replaces it.
    Ok(serde_json::from_str(&text).ok())
}

/// The admin key for `connection`, or `None` when there is none, it has
/// expired, or it was made for another origin or company than the
/// connection names now. The key stays in the shell: the caller puts it in
/// one header.
pub fn admin_key(
    backend: &dyn SecretBackend,
    connection: &PaperclipConnection,
    now: u64,
) -> Result<Option<String>, SecretError> {
    let usable = read_record(backend)?.is_some_and(|record| {
        record.connection == connection.connection
            && record.origin == connection.origin
            && record.company == connection.company
            && record.expires > now
    });
    if !usable {
        return Ok(None);
    }
    backend.get(&key_name()?)
}

/// The admin key's sign-in: the connection it was made for, as that
/// connection's keychain entry names it now, the board member who approved
/// it, and the key. `None` when there is no usable key: none was stored, it
/// expired, or the connection's entry is gone or now names another origin or
/// company. The connection always comes from the sign-in's record and the
/// connection's own entry, never from the page.
pub fn admin_session(
    backend: &dyn SecretBackend,
    now: u64,
) -> Result<Option<(PaperclipConnection, String, String)>, SecretError> {
    let Some(record) = read_record(backend)? else {
        return Ok(None);
    };
    let Some(connection) = connection_of(backend, &record.connection)? else {
        return Ok(None);
    };
    let key = admin_key(backend, &connection, now)?;
    Ok(key.map(|key| (connection, record.user, key)))
}

/// Stores a new admin key for `connection`, approved by `user`: the key
/// first, then the record that points at it, so a failure halfway never
/// leaves a record without its key.
pub fn store_admin_key(
    backend: &dyn SecretBackend,
    connection: &PaperclipConnection,
    user: &str,
    key: &str,
    now: u64,
) -> Result<(), SecretError> {
    check_value(key)?;
    backend.set(&key_name()?, key)?;
    let record = serde_json::to_string(&AdminRecord {
        connection: connection.connection.clone(),
        origin: connection.origin.clone(),
        company: connection.company.clone(),
        user: user.to_owned(),
        expires: now.saturating_add(ADMIN_KEY_SECONDS),
    })
    .map_err(|error| SecretError::Backend {
        message: error.to_string(),
    })?;
    backend.set(&record_name()?, &record)
}

/// Forgets the admin key: the key first, then the record. The caller revokes
/// it in Paperclip before, while it still has it. Doing nothing when there
/// is none.
pub fn forget_admin_key(backend: &dyn SecretBackend) -> Result<(), SecretError> {
    backend.delete(&key_name()?)?;
    backend.delete(&record_name()?)
}
