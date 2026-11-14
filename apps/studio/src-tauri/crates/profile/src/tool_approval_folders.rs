//! The folders of the listed tools' approvals, as `toolApprovalFolder` in
//! `@halonicjs/profile` and `FileToolApprovalStore` in `fs-node` name them
//! (HAL-8868), so the Studio shell and the CLI read and write the same
//! approvals. Each source in each workspace has a folder of its own in
//! `tool-approvals`, named by the SHA-256 of `[location, source]` as JSON.

use sha2::{Digest, Sha256};

use crate::workspace_folders::without_verbatim_prefix;
use crate::{Platform, ProfileFolder, join_path};

/// The name of the folder in the profile that holds the approvals of
/// listed tools.
const TOOL_APPROVAL_FOLDER_NAME: &str = "tool-approvals";

impl ProfileFolder {
    /// The folder for the approvals of listed tools, `tool-approvals` in the
    /// profile folder, as `toolApprovalFolder` names it.
    pub fn tool_approval_folder(&self) -> String {
        join_path(self.platform, &self.root, &[TOOL_APPROVAL_FOLDER_NAME])
    }

    /// The folder of one source's approvals in one workspace, as
    /// `FileToolApprovalStore` names it. `location` is the workspace's real
    /// path as the CLI's `realpath` spells it: on Windows the verbatim
    /// prefix `canonicalize` adds is dropped, so both name one folder.
    pub fn tool_approval_source_folder(&self, location: &str, source: &str) -> String {
        let location = match self.platform {
            Platform::Windows => without_verbatim_prefix(location),
            Platform::Macos | Platform::Linux => location.to_owned(),
        };
        let name = source_folder_name(&location, source);
        join_path(
            self.platform,
            &self.root,
            &[TOOL_APPROVAL_FOLDER_NAME, &name],
        )
    }
}

/// The 64 hex characters of the SHA-256 of `JSON.stringify([location,
/// source])`, taken over its UTF-16 code units, little-endian, as the store
/// hashes it.
fn source_folder_name(location: &str, source: &str) -> String {
    let json = format!("[{},{}]", json_string(location), json_string(source));
    let bytes: Vec<u8> = json.encode_utf16().flat_map(u16::to_le_bytes).collect();
    Sha256::digest(&bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// `text` as a JSON string the way `JSON.stringify` writes it: only `"`,
/// `\` and the control characters are escaped.
fn json_string(text: &str) -> String {
    let mut written = String::from('"');
    for character in text.chars() {
        match character {
            '"' => written.push_str("\\\""),
            '\\' => written.push_str("\\\\"),
            '\u{8}' => written.push_str("\\b"),
            '\u{c}' => written.push_str("\\f"),
            '\n' => written.push_str("\\n"),
            '\r' => written.push_str("\\r"),
            '\t' => written.push_str("\\t"),
            control if control < ' ' => written.push_str(&format!("\\u{:04x}", control as u32)),
            other => written.push(other),
        }
    }
    written.push('"');
    written
}
