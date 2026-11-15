//! The instructions a person trusted for one agent, as the page and the CLI
//! write them: `InstructionTrustRecord` in `packages/core/ports`. The shell
//! checks a record as `isInstructionTrustFor` does: exactly these fields, a
//! pin whose digests are all in `sha256:` form, and the key asked for.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::TrustError;

/// Which agent's instructions a record is for. Both parts are compared
/// exactly as given.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct InstructionKey {
    /// The workspace's resolved real path.
    pub location: String,
    /// The agent's id in the workspace.
    pub agent: String,
}

/// What a run's instructions were: a digest per file, and one for the set.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct InstructionPin {
    pub digest: String,
    /// Each file's digest, by file name, sorted by name.
    pub files: BTreeMap<String, String>,
}

/// The instructions a person trusted for one agent. The fields are in the
/// order the file keeps them, the key first, as `fs-node` writes them.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct InstructionRecord {
    pub location: String,
    pub agent: String,
    pub pin: InstructionPin,
    /// When the person trusted them, as ISO text.
    #[serde(rename = "grantedAt")]
    pub granted_at: String,
}

impl InstructionRecord {
    /// The record in `value`, or `InvalidRecord` when it isn't exactly a
    /// record with valid digests.
    pub fn from_value(value: &serde_json::Value) -> Result<Self, TrustError> {
        let record = Self::deserialize(value).map_err(|_| TrustError::InvalidRecord)?;
        if record.has_valid_digests() {
            Ok(record)
        } else {
            Err(TrustError::InvalidRecord)
        }
    }

    /// The record in a file's text, or `None` when it isn't a valid record.
    pub(crate) fn from_text(text: &str) -> Option<Self> {
        let record: Self = serde_json::from_str(text).ok()?;
        record.has_valid_digests().then_some(record)
    }

    /// The key the record is for.
    pub fn key(&self) -> InstructionKey {
        InstructionKey {
            location: self.location.clone(),
            agent: self.agent.clone(),
        }
    }

    pub(crate) fn is_for(&self, key: &InstructionKey) -> bool {
        self.location == key.location && self.agent == key.agent
    }

    fn has_valid_digests(&self) -> bool {
        is_digest(&self.pin.digest) && self.pin.files.values().all(|digest| is_digest(digest))
    }
}

/// `sha256:` and 64 lower-case hex digits.
fn is_digest(text: &str) -> bool {
    text.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64
            && hex
                .bytes()
                .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
    })
}
