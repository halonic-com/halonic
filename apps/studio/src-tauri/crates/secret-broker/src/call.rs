use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError, TryLockError};

use halonic_secrets::SecretBackend;

use crate::broker::{BrokerAnswer, BrokerRefusal, BrokerRequest};
use crate::trust::WorkspaceTrust;

/// One request's keychain call, run on its own thread.
pub(crate) struct KeychainCall {
    pub(crate) backend: Arc<dyn SecretBackend>,
    pub(crate) trust: Arc<dyn WorkspaceTrust>,
    pub(crate) keychain: Arc<Mutex<()>>,
    /// Set when the wait for this call timed out.
    pub(crate) given_up: Arc<AtomicBool>,
    pub(crate) request: BrokerRequest,
}

impl KeychainCall {
    /// Waits its turn, then reads. `None` when it had to wait behind another
    /// call and the engine was answered `unavailable` meanwhile: a stuck
    /// unlock prompt must not be followed by one more prompt for every
    /// request that queued behind it.
    pub(crate) fn run(&self) -> Option<Result<BrokerAnswer, BrokerRefusal>> {
        let _alone = match self.keychain.try_lock() {
            Ok(guard) => guard,
            Err(TryLockError::Poisoned(poisoned)) => poisoned.into_inner(),
            Err(TryLockError::WouldBlock) => {
                let guard = self.keychain.lock().unwrap_or_else(PoisonError::into_inner);
                if self.given_up.load(Ordering::SeqCst) {
                    return None;
                }
                guard
            }
        };
        // Again, now that it's this call's turn: trust may have been revoked
        // while it waited behind a slow call.
        if let Err(refusal) = check_trust(self.trust.as_ref()) {
            return Some(Err(refusal));
        }
        Some(
            self.request
                .read(self.backend.as_ref())
                .map_err(BrokerRefusal::from),
        )
    }
}

pub(crate) fn check_trust(trust: &dyn WorkspaceTrust) -> Result<(), BrokerRefusal> {
    match trust.is_trusted() {
        Ok(true) => Ok(()),
        Ok(false) => Err(BrokerRefusal::Untrusted),
        Err(error) => {
            halonic_shell_log::record(
                "secret-broker",
                format_args!("couldn't read the workspace's trust record: {error}"),
            );
            Err(BrokerRefusal::Untrusted)
        }
    }
}
