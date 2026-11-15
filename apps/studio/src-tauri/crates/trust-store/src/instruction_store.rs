use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde_json::json;

use crate::error::TrustError;
use crate::instruction_record::{InstructionKey, InstructionRecord};
use crate::record_file::file_name;
use crate::store::{create_private_folder, write_replacing};
use crate::unlinked::{ReadFailure, read_unlinked};

/// The instructions a person trusted for each agent as files in one folder
/// of the profile, `<profile>/instruction-trust`, laid out as
/// `FileInstructionTrustStore` in `fs-node` lays them out (requirement
/// `instruction-trust-files`): one JSON file per agent, named by the SHA-256
/// of the JSON of `[location, agent]` as UTF-16 code units, little-endian.
///
/// A save writes a temporary file and renames it over the record, so a
/// reader sees the old record or the new one, never half of one. A record
/// that is a link can't be read, so an agent can't point one at a file in
/// its workspace. The folder must never be inside a workspace, or an agent
/// could trust its own edited instructions.
#[derive(Debug, Clone)]
pub struct FileInstructionTrustStore {
    root: PathBuf,
}

impl FileInstructionTrustStore {
    /// A store over `root`, which is created on the first save.
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// The record for `key`, or `None` when there is none. Refuses a record
    /// that can't be read, is a link, or isn't exactly trusted instructions
    /// for `key`: a file copied over another agent's would let one agent
    /// borrow another's trust.
    pub fn get(&self, key: &InstructionKey) -> Result<Option<InstructionRecord>, TrustError> {
        let file = self.file_for(key);
        let bytes = match read_unlinked(&file) {
            Ok(bytes) => bytes,
            Err(ReadFailure::Missing) => return Ok(None),
            Err(_) => return Err(unreadable(key, &file)),
        };
        String::from_utf8(bytes)
            .ok()
            .and_then(|text| InstructionRecord::from_text(&text))
            .filter(|record| record.is_for(key))
            .map(Some)
            .ok_or_else(|| unreadable(key, &file))
    }

    /// Saves a record, replacing any record for the same key, even one that
    /// can't be read. The folder is made private even when it was there.
    pub fn save(&self, record: &InstructionRecord) -> Result<(), TrustError> {
        let file = self.file_for(&record.key());
        let text = format!(
            "{}\n",
            serde_json::to_string_pretty(record).map_err(|error| TrustError::Io {
                message: error.to_string(),
            })?
        );
        create_private_folder(&self.root)?;
        make_private(&self.root)?;
        write_replacing(&file, &text)
    }

    /// Deletes the record for `key` without reading it, so a damaged record
    /// goes too. Removing one that isn't there is not an error.
    pub fn remove(&self, key: &InstructionKey) -> Result<(), TrustError> {
        match fs::remove_file(self.file_for(key)) {
            Err(error) if error.kind() != ErrorKind::NotFound => Err(error.into()),
            _ => Ok(()),
        }
    }

    fn file_for(&self, key: &InstructionKey) -> PathBuf {
        self.root.join(instruction_file_name(key))
    }
}

/// The record file's name for a key: the hash of the JSON of
/// `[location, agent]`, which keeps a location ending in `/` from running
/// into the agent id.
pub fn instruction_file_name(key: &InstructionKey) -> String {
    file_name(&json!([key.location, key.agent]).to_string())
}

fn unreadable(key: &InstructionKey, file: &Path) -> TrustError {
    TrustError::Unreadable {
        location: Some(key.location.clone()),
        file: file.to_owned(),
    }
}

/// Makes a folder that was there already readable by its owner only too.
#[cfg(unix)]
fn make_private(folder: &Path) -> Result<(), TrustError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(folder, fs::Permissions::from_mode(0o700))?;
    Ok(())
}

#[cfg(not(unix))]
fn make_private(_folder: &Path) -> Result<(), TrustError> {
    Ok(())
}
