//! The everyday Paperclip key stays in the shell, never in the page (6.8,
//! condition 1, HAL-20278; requirement `paperclip-key-keep`).
//!
//! The agent host's approved sign-in poll is the one answer that holds a
//! connection's key. The shell takes the key out of that answer and writes it
//! to the connection's keychain entry ([`SecretName::paperclip_key`]), with
//! the address and company it was made for and the workspaces it was signed
//! in from. It then confirms the sign-in to the host itself, and passes the
//! page the answer without the key. Disconnect deletes the entry here too,
//! whatever the host answered. Nothing here knows Tauri: the shell gives it
//! the keychain and its way to the host, so it builds and tests anywhere.

use std::fmt;

use halonic_secrets::{SecretBackend, SecretError, SecretName, check_value};
use serde_json::{Value, json};

/// Where failures nobody else hears about go in the shell's log.
const LOG_SOURCE: &str = "paperclip-key";

/// What the keychain errors in the log say failed.
const KEEP: &str = "keeping the Paperclip key";

/// A connection's everyday Paperclip key. Its `Debug` never shows it, and it
/// has no `Serialize`, so it can't reach a log, an error or an answer.
pub struct PaperclipKey(String);

impl fmt::Debug for PaperclipKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("PaperclipKey(redacted)")
    }
}

/// A call to the host that failed. It holds nothing the host answered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HostCallFailed;

/// The sign-in calls the shell makes itself while it keeps a key.
pub trait SignInHost {
    /// Sends `POST /v1/paperclip/sign-in/confirm` for `sign_in_id`, a route
    /// no page can name, and answers whether the host still had the sign-in.
    fn confirm(&self, sign_in_id: &str) -> Result<bool, HostCallFailed>;

    /// Sends `POST /v1/paperclip/sign-in/cancel` for `sign_in_id`, so the
    /// host revokes the new key and undoes the sign-in.
    fn cancel(&self, sign_in_id: &str) -> Result<(), HostCallFailed>;
}

/// The approved poll's answer, as the host sends it to the shell.
#[derive(Debug)]
struct Connected {
    connection: String,
    address: String,
    company: String,
    /// The workspace's real path, as the host resolved it for the sign-in.
    workspace: String,
    key: PaperclipKey,
}

/// What the page gets for the host's answer `body` to a poll of the sign-in
/// `sign_in_id`. Any answer but `connected` passes on without a `key` field.
/// A `connected` one is kept: the page gets the connection, address and
/// company only. When the shell can't read that answer, write the entry or
/// confirm it, it puts back the entry held before, cancels the sign-in so
/// the host revokes the new key, and the page gets `key-not-saved`.
pub fn keep_poll_answer(
    keychain: &dyn SecretBackend,
    host: &dyn SignInHost,
    sign_in_id: &str,
    body: Value,
) -> Value {
    if !is_connected(&body) {
        return without_key(body);
    }
    let Some(connected) = connected_of(&body) else {
        record("the host's approved sign-in answer can't be read, so it is cancelled");
        cancel(host, sign_in_id);
        return key_not_saved();
    };
    if !keep(keychain, host, sign_in_id, &connected) {
        return key_not_saved();
    }
    json!({
        "status": "connected",
        "connection": connected.connection,
        "address": connected.address,
        "company": connected.company,
    })
}

/// What the page gets for the host's answer `body` to its cancel: the answer
/// without a `key` field. A cancel never keeps a key, so a `connected`
/// answer passes on as `cancelled`, and the host revokes the key nobody
/// confirmed.
pub fn page_cancel_answer(body: Value) -> Value {
    if is_connected(&body) {
        return json!({ "status": "cancelled" });
    }
    without_key(body)
}

/// Deletes the keychain entry of the Paperclip connection `connection`, as
/// Disconnect does once it has asked the host, also when the host refused or
/// couldn't be asked, so Disconnect never leaves the key behind on this
/// computer. Deleting an entry that isn't there succeeds.
pub fn forget_paperclip_key(
    keychain: &dyn SecretBackend,
    connection: &str,
) -> Result<(), SecretError> {
    keychain.delete(&SecretName::paperclip_key(connection)?)
}

/// Writes the key's entry and confirms the sign-in, and answers whether both
/// happened. When either fails, the entry held before comes back and the
/// sign-in is cancelled, so the host revokes the new key and the connection
/// keeps its old one (HAL-18048).
fn keep(
    keychain: &dyn SecretBackend,
    host: &dyn SignInHost,
    sign_in_id: &str,
    connected: &Connected,
) -> bool {
    let name = match SecretName::paperclip_key(&connected.connection) {
        Ok(name) => name,
        Err(error) => return refused(host, sign_in_id, &error),
    };
    // Read first, so a Sign in again that fails leaves the old key.
    let before = match keychain.get(&name) {
        Ok(before) => before,
        Err(error) => return refused(host, sign_in_id, &error),
    };
    let entry = entry_text(connected, before.as_deref());
    if let Err(error) = fits(keychain, &entry).and_then(|()| keychain.set(&name, &entry)) {
        return refused(host, sign_in_id, &error);
    }
    if confirmed(host, sign_in_id) {
        return true;
    }
    put_back(keychain, &name, before.as_deref());
    cancel(host, sign_in_id);
    false
}

/// Checks the entry's text as the token commands check a value: not empty,
/// and no longer than the keychain can keep.
fn fits(keychain: &dyn SecretBackend, entry: &str) -> Result<(), SecretError> {
    check_value(entry)?;
    if entry.len() > keychain.max_value_bytes() {
        return Err(SecretError::InvalidValue);
    }
    Ok(())
}

/// Records why the key wasn't kept, cancels the sign-in and answers `false`.
fn refused(host: &dyn SignInHost, sign_in_id: &str, error: &SecretError) -> bool {
    record(error.log_message(KEEP));
    cancel(host, sign_in_id);
    false
}

/// Confirms the keychain write to the host. A confirm that failed is sent
/// once more, as its answer may have been lost after the host took it; the
/// host answers a repeated confirm the same way.
fn confirmed(host: &dyn SignInHost, sign_in_id: &str) -> bool {
    if let Ok(confirmed) = host.confirm(sign_in_id) {
        return confirmed;
    }
    record("the sign-in's confirm failed, so it is sent once more");
    match host.confirm(sign_in_id) {
        Ok(confirmed) => confirmed,
        Err(HostCallFailed) => {
            record("the sign-in's confirm failed again, so the key isn't kept");
            false
        }
    }
}

/// Puts back the entry held before, or removes the new one when there was
/// none, so the keychain keeps no key the host revokes.
fn put_back(keychain: &dyn SecretBackend, name: &SecretName, before: Option<&str>) {
    let put = match before {
        Some(before) => keychain.set(name, before),
        None => keychain.delete(name),
    };
    if let Err(error) = put {
        record(error.log_message(KEEP));
    }
}

/// Cancels the sign-in. When that fails too, the host still revokes the key
/// a minute after it handed it over, because nobody confirmed it.
fn cancel(host: &dyn SignInHost, sign_in_id: &str) {
    if host.cancel(sign_in_id).is_err() {
        record("the sign-in's cancel failed; the host revokes the unconfirmed key within a minute");
    }
}

/// The text the keychain keeps: the key with the address and company it was
/// made for, and the workspaces it was signed in from. It is the form the
/// page wrote before (`paperclipKeyEntryText`), so an entry stored then
/// still reads the same.
fn entry_text(connected: &Connected, before: Option<&str>) -> String {
    json!({
        "key": connected.key.0,
        "address": connected.address,
        "company": connected.company,
        "workspaces": workspaces_with(before, connected),
    })
    .to_string()
}

/// The workspaces a new key's entry names: those the entry held `before`
/// named, when it was made for the same address and company, then this one.
/// A key for another address or company starts the list again. Addresses
/// are compared as written, since the host writes each as its origin; a
/// mismatch only costs a sign-in, never a key to another workspace.
fn workspaces_with(before: Option<&str>, connected: &Connected) -> Vec<String> {
    let kept = before
        .and_then(|text| kept_workspaces(text, &connected.address, &connected.company))
        .unwrap_or_default();
    let mut workspaces: Vec<String> = kept
        .into_iter()
        .filter(|each| !same_workspace(each, &connected.workspace))
        .collect();
    workspaces.push(connected.workspace.clone());
    workspaces
}

/// The workspaces an entry's `text` names, when it is an entry made for
/// `address` and `company`. A `workspaces` that isn't a list of texts counts
/// as none, as on the page.
fn kept_workspaces(text: &str, address: &str, company: &str) -> Option<Vec<String>> {
    let entry: Value = serde_json::from_str(text).ok()?;
    let is_entry = entry.get("key").is_some_and(Value::is_string);
    let same_place = entry.get("address").and_then(Value::as_str) == Some(address)
        && entry.get("company").and_then(Value::as_str) == Some(company);
    if !is_entry || !same_place {
        return None;
    }
    let listed = entry.get("workspaces").and_then(Value::as_array)?;
    listed
        .iter()
        .map(|each| each.as_str().map(str::to_owned))
        .collect()
}

/// Whether two real paths, as the agent host resolves them, name one
/// folder: the same text, or two Windows paths (`C:\…` or `\\server\…`) that
/// differ only in case, as Windows treats them. The page's `sameWorkspace`.
pub(crate) fn same_workspace(first: &str, second: &str) -> bool {
    first == second
        || (is_windows_path(first)
            && is_windows_path(second)
            && first.to_lowercase() == second.to_lowercase())
}

/// Whether `path` is a Windows one: a drive letter, or a share's `\\server\…`.
fn is_windows_path(path: &str) -> bool {
    let has_drive = matches!(
        path.as_bytes(),
        [drive, b':', b'\\' | b'/', ..] if drive.is_ascii_alphabetic()
    );
    has_drive || path.starts_with(r"\\")
}

fn is_connected(body: &Value) -> bool {
    body.get("status").and_then(Value::as_str) == Some("connected")
}

/// The approved answer's fields, or `None` when one is missing or empty.
fn connected_of(body: &Value) -> Option<Connected> {
    let text = |field: &str| {
        body.get(field)
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(str::to_owned)
    };
    Some(Connected {
        connection: text("connection")?,
        address: text("address")?,
        company: text("company")?,
        workspace: text("workspace")?,
        key: PaperclipKey(text("key")?),
    })
}

/// `body` without a top-level `key` field. The host answers a key only in an
/// approved poll; this keeps any other answer from carrying one to the page.
fn without_key(mut body: Value) -> Value {
    if let Value::Object(fields) = &mut body {
        fields.remove("key");
    }
    body
}

fn key_not_saved() -> Value {
    json!({ "status": "key-not-saved" })
}

fn record(message: impl fmt::Display) {
    halonic_shell_log::record(LOG_SOURCE, message);
}

#[cfg(test)]
#[path = "paperclip_keep/tests.rs"]
mod tests;
