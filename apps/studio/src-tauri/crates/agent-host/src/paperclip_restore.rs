//! The kept Paperclip key goes back to the agent host from the shell, never
//! through the page (6.8, condition 1, HAL-20278; requirement
//! `paperclip-key-keep`; Julian's conditions on HAL-20292).
//!
//! When a workspace opens, the page asks the shell once to restore its
//! connections. The shell asks the host for the workspace's connections and
//! whether it may start a run, then hands each connection's key back itself,
//! with `POST /v1/paperclip/key`, a route no page can name. It hands a key
//! back only when all of these hold, and reads the keychain only once the
//! first three do:
//!
//! - the host answered `mayStart: true` for the workspace, worked out from
//!   the files and the trust record by the rule runs start by;
//! - the workspace's real path, as the host answered it, is a folder the
//!   person picked, and is still that folder;
//! - the host lists the connection as holding no key (`no-key`) or as
//!   signed out;
//! - the connection's entry names that real path, and was made for the
//!   address origin and company the connection file names now.
//!
//! The page's word can only start a restore, never choose what it hands
//! over. Page script can still make a picked workspace one that may start a
//! run (it can save a trust record for a folder inside a picked one, and
//! edit the files), so this keeps a workspace with untrusted content from
//! getting the key back; what holds against page script is that the key
//! never reaches the page, and goes only to the address and company it was
//! made for. Nothing here knows Tauri.

use halonic_secrets::{SecretBackend, SecretName};
use serde_json::{Value, json};

use crate::paperclip_keep::{HostCallFailed, PaperclipKey};

/// Where failures nobody else hears about go in the shell's log.
const LOG_SOURCE: &str = "paperclip-key";

/// The calls the shell makes itself to restore a workspace's keys.
pub trait RestoreHost {
    /// Sends `POST /v1/paperclip/connections` for `workspace`, asking for
    /// `mayStart`, and answers the host's body when it took the call.
    fn connections(&self, workspace: &str) -> Result<Value, HostCallFailed>;

    /// Sends `POST /v1/paperclip/key` with `hand_over`'s body, a route no
    /// page can name, and answers whether the host kept the key.
    fn hand_over(&self, hand_over: &HandOver) -> Result<(), HostCallFailed>;
}

/// The checks the shell makes with what it knows and the host doesn't.
pub trait RestoreChecks {
    /// Whether `real_path` is a folder the person picked, and still that
    /// folder (`PickedFolders::is_still_picked`).
    fn is_still_picked(&self, real_path: &str) -> bool;

    /// Whether two addresses have the same scheme, host and port: the part
    /// the host's key guard compares before every call.
    fn same_origin(&self, first: &str, second: &str) -> bool;
}

/// One key going back to the host, for one workspace's connection. Its
/// `Debug` never shows the key.
#[derive(Debug)]
pub struct HandOver {
    workspace: String,
    connection: String,
    address: String,
    company: String,
    key: PaperclipKey,
}

impl HandOver {
    /// The connection the key goes back to.
    pub fn connection(&self) -> &str {
        &self.connection
    }

    /// The workspace's real path the key goes back to.
    pub fn workspace(&self) -> &str {
        &self.workspace
    }

    /// The body of `POST /v1/paperclip/key`, the one place the key leaves
    /// the shell. Only [`RestoreHost::hand_over`] sends it, and only to the
    /// agent host.
    pub fn body(&self) -> Value {
        json!({
            "workspace": self.workspace,
            "connection": self.connection,
            "key": self.key.0,
            "address": self.address,
            "company": self.company,
        })
    }
}

/// Restores the keys of the workspace `workspace` names, as the page names
/// it, and answers how many went back. It never asks the person anything.
/// It fails only when the host couldn't list the workspace's connections, as
/// while it still starts, so the page can ask again (HAL-19027); anything
/// else it can't do goes to the shell's log, and that connection stays on
/// Sign in again.
pub fn restore_paperclip_keys(
    keychain: &dyn SecretBackend,
    host: &dyn RestoreHost,
    checks: &dyn RestoreChecks,
    workspace: &str,
) -> Result<usize, HostCallFailed> {
    let list = host.connections(workspace)?;
    let Some(real_path) = may_restore(&list, checks) else {
        return Ok(0);
    };
    let rows = list
        .get("connections")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    let restored = rows
        .iter()
        .filter_map(Row::of)
        .filter(|row| row.needs_key)
        .filter(|row| restore_one(keychain, host, checks, real_path, row))
        .count();
    Ok(restored)
}

/// The workspace's real path, when the host's answer `list` lets any key go
/// back to it: the host said it may start a run, with a JSON `true` and
/// nothing else, and the real path is still a folder the person picked.
fn may_restore<'list>(list: &'list Value, checks: &dyn RestoreChecks) -> Option<&'list str> {
    // An older host answers no `mayStart`; that counts as no.
    if list.get("mayStart") != Some(&Value::Bool(true)) {
        record("the workspace may not start a run, so no key goes back");
        return None;
    }
    let real_path = list
        .get("workspace")
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty())?;
    if !checks.is_still_picked(real_path) {
        record("the workspace isn't a folder the person picked, so no key goes back");
        return None;
    }
    Some(real_path)
}

/// Hands one connection's key back when its entry fits; whether it did.
fn restore_one(
    keychain: &dyn SecretBackend,
    host: &dyn RestoreHost,
    checks: &dyn RestoreChecks,
    real_path: &str,
    row: &Row,
) -> bool {
    let Ok(name) = SecretName::paperclip_key(&row.name) else {
        return false;
    };
    let text = match keychain.get(&name) {
        Ok(Some(text)) => text,
        Ok(None) => return false,
        Err(error) => {
            record(error.log_message("reading a kept Paperclip key"));
            return false;
        }
    };
    let Some(entry) = KeptEntry::of(&text) else {
        return false;
    };
    let fits = entry
        .workspaces
        .iter()
        .any(|each| crate::paperclip_keep::same_workspace(each, real_path))
        && checks.same_origin(&entry.address, &row.address)
        && entry.company == row.company;
    if !fits {
        return false;
    }
    let hand_over = HandOver {
        workspace: real_path.to_owned(),
        connection: row.name.clone(),
        address: entry.address,
        company: entry.company,
        key: entry.key,
    };
    if host.hand_over(&hand_over).is_err() {
        record("the host didn't keep a restored Paperclip key");
        return false;
    }
    true
}

/// A connection as the host lists it.
struct Row {
    name: String,
    address: String,
    company: String,
    /// Whether the host holds no usable key for it: none on this computer
    /// yet (`no-key`, as after a restart), or one Paperclip refused.
    needs_key: bool,
}

impl Row {
    /// The row `value` describes, or `None` when a field is missing.
    fn of(value: &Value) -> Option<Self> {
        let text = |field: &str| value.get(field).and_then(Value::as_str).map(str::to_owned);
        let kind = value
            .get("state")
            .and_then(|state| state.get("kind"))
            .and_then(Value::as_str);
        Some(Self {
            name: text("name")?,
            address: text("address")?,
            company: text("company")?,
            needs_key: matches!(kind, Some("no-key" | "signed-out")),
        })
    }
}

/// A connection's keychain entry: the key with the address and company it
/// was made for, and the workspaces it was signed in from.
struct KeptEntry {
    key: PaperclipKey,
    address: String,
    company: String,
    workspaces: Vec<String>,
}

impl KeptEntry {
    /// The entry `text` holds, or `None` when it isn't one. A `workspaces`
    /// that isn't a list of texts counts as none, so it restores nothing.
    fn of(text: &str) -> Option<Self> {
        let value: Value = serde_json::from_str(text).ok()?;
        let field = |name: &str| value.get(name).and_then(Value::as_str).map(str::to_owned);
        let workspaces = value
            .get("workspaces")
            .and_then(Value::as_array)
            .and_then(|listed| {
                listed
                    .iter()
                    .map(|each| each.as_str().map(str::to_owned))
                    .collect::<Option<Vec<_>>>()
            })
            .unwrap_or_default();
        Some(Self {
            key: PaperclipKey(field("key")?),
            address: field("address")?,
            company: field("company")?,
            workspaces,
        })
    }
}

fn record(message: impl std::fmt::Display) {
    halonic_shell_log::record(LOG_SOURCE, message);
}

#[cfg(test)]
#[path = "paperclip_restore/tests.rs"]
mod tests;
