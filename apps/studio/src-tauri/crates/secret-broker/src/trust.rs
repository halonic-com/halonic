use std::path::PathBuf;

use halonic_trust_store::FileTrustStore;

/// Whether the engine's workspace is trusted on this computer right now.
/// The broker asks before every answer, so revoking trust stops the next
/// request, not the next engine start.
pub trait WorkspaceTrust: Send + Sync {
    /// `Ok(true)` while the workspace has a trust record. An error means
    /// the answer isn't known, and the broker refuses.
    fn is_trusted(&self) -> Result<bool, String>;
}

/// The trust record of one workspace in the profile's trust store, the one
/// the window's trust dialog writes and the engine reads.
#[derive(Debug, Clone)]
pub struct TrustRecord {
    store: FileTrustStore,
    location: String,
    real_path: Option<PathBuf>,
}

impl TrustRecord {
    /// The record for `location`, given exactly as grants give it.
    pub fn new(store: FileTrustStore, location: String) -> Self {
        Self {
            store,
            location,
            real_path: None,
        }
    }

    /// The record for `location`, which counts only while `location` still
    /// leads to `real_path`, the folder the engine runs in. The dialog keys
    /// its records on the location string, so a link that once led to a
    /// trusted folder and now leads elsewhere would otherwise lend that
    /// trust to a folder nobody trusted.
    pub fn for_workspace(store: FileTrustStore, location: String, real_path: PathBuf) -> Self {
        Self {
            store,
            location,
            real_path: Some(real_path),
        }
    }

    /// Whether `location` still leads to the engine's folder. A location
    /// that no longer exists leads nowhere.
    fn leads_to_workspace(&self) -> bool {
        match &self.real_path {
            None => true,
            Some(real_path) => {
                std::fs::canonicalize(&self.location).is_ok_and(|resolved| resolved == *real_path)
            }
        }
    }
}

impl WorkspaceTrust for TrustRecord {
    fn is_trusted(&self) -> Result<bool, String> {
        if !self.leads_to_workspace() {
            return Ok(false);
        }
        self.store
            .get(&self.location)
            .map(|record| record.is_some())
            .map_err(|error| error.to_string())
    }
}
