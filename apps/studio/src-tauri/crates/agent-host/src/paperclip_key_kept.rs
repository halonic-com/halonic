//! Whether the shell keeps a Paperclip key for a connection, as one bit the
//! page may learn and never the key (HAL-20265; requirement
//! `paperclip-key-keep`).
//!
//! A connection's keychain entry is named after the connection only
//! (`paperclip-<connection>`), not after the workspace, so an entry signed
//! in from another workspace, or one the host doesn't hold yet, is invisible
//! to the agent host's list. The page's sign-in asks this before it starts,
//! so it never writes over an entry the shell keeps.
//!
//! The shell answers only for a workspace that is still a folder the person
//! picked, as the host resolves its real path, and only for a connection the
//! host lists for that workspace from its connection file. So the page can't
//! probe an entry no connection file of the person's names. The name's form
//! is checked before anything else, and the keychain is asked last. Nothing
//! here knows Tauri.

use halonic_secrets::{SecretBackend, SecretName};
use serde_json::Value;

use crate::paperclip_keep::HostCallFailed;
use crate::paperclip_restore::{RestoreChecks, RestoreHost};

/// The longest connection name, as the host's connection files allow it.
const MAX_CONNECTION_NAME: usize = 64;

/// Why the shell doesn't answer whether a key is kept.
#[derive(Debug, PartialEq, Eq)]
pub enum KeptRefusal {
    /// The name isn't one a connection file can have.
    InvalidConnection,
    /// The host couldn't list the workspace's connections.
    HostUnavailable,
    /// The workspace's real path isn't a folder the person picked, or is no
    /// longer that folder.
    NotPicked,
    /// The host lists no connection of that name for the workspace.
    UnknownConnection,
    /// The keychain couldn't be asked. The message names the failure and
    /// never holds a key.
    Keychain(String),
}

/// Whether the keychain holds an entry for `connection`, a connection of
/// the workspace `workspace` names, as the page names it. It asks the host
/// for the workspace's connections first, and the keychain only once the
/// workspace is a picked folder and lists the connection.
pub fn paperclip_key_kept(
    keychain: &dyn SecretBackend,
    host: &dyn RestoreHost,
    checks: &dyn RestoreChecks,
    workspace: &str,
    connection: &str,
) -> Result<bool, KeptRefusal> {
    if !is_connection_name(connection) {
        return Err(KeptRefusal::InvalidConnection);
    }
    let name = SecretName::paperclip_key(connection).map_err(|_| KeptRefusal::InvalidConnection)?;
    let list = host
        .connections(workspace)
        .map_err(|HostCallFailed| KeptRefusal::HostUnavailable)?;
    let picked = list
        .get("workspace")
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty())
        .is_some_and(|real_path| checks.is_still_picked(real_path));
    if !picked {
        return Err(KeptRefusal::NotPicked);
    }
    if !lists_connection(&list, connection) {
        return Err(KeptRefusal::UnknownConnection);
    }
    keychain.has(&name).map_err(|error| {
        KeptRefusal::Keychain(error.log_message("asking whether a Paperclip key is kept"))
    })
}

/// Whether `name` has the form of a connection's name, as the host reads it
/// from a connection file's name: a letter or digit, then up to 63 letters,
/// digits, `_` or `-`, ASCII only (`paperclipConnectionNamePattern`).
pub fn is_connection_name(name: &str) -> bool {
    let mut bytes = name.bytes();
    let starts_well = bytes
        .next()
        .is_some_and(|first| first.is_ascii_alphanumeric());
    starts_well
        && name.len() <= MAX_CONNECTION_NAME
        && bytes.all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

/// Whether the host's answer `list` has a row named exactly `connection`.
fn lists_connection(list: &Value, connection: &str) -> bool {
    list.get("connections")
        .and_then(Value::as_array)
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| row.get("name").and_then(Value::as_str) == Some(connection))
        })
}

#[cfg(test)]
#[path = "paperclip_key_kept/tests.rs"]
mod tests;
