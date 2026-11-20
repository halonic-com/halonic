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
}

impl TrustRecord {
    /// The record for `location`, given exactly as grants give it.
    pub fn new(store: FileTrustStore, location: String) -> Self {
        Self { store, location }
    }
}

impl WorkspaceTrust for TrustRecord {
    fn is_trusted(&self) -> Result<bool, String> {
        self.store
            .get(&self.location)
            .map(|record| record.is_some())
            .map_err(|error| error.to_string())
    }
}
