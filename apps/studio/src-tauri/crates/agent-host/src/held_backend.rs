//! A keychain for tests that waits as a real one can, so a test can send a
//! second request while the first is still being answered.

use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex, PoisonError};

use halonic_secrets::{SecretBackend, SecretError, SecretName};

/// A keychain that holds each read until the test releases it, as one
/// waiting for the person to allow access does.
pub(crate) struct Held {
    released: Mutex<Receiver<()>>,
}

impl Held {
    /// The keychain, and the sender that releases one read each time.
    pub(crate) fn with_release() -> (Arc<dyn SecretBackend>, Sender<()>) {
        let (release, released) = mpsc::channel();
        let backend = Arc::new(Self {
            released: Mutex::new(released),
        });
        (backend, release)
    }
}

impl SecretBackend for Held {
    fn get(&self, _: &SecretName) -> Result<Option<String>, SecretError> {
        let released = self.released.lock().unwrap_or_else(PoisonError::into_inner);
        let _ = released.recv();
        Ok(None)
    }
    fn set(&self, _: &SecretName, _: &str) -> Result<(), SecretError> {
        Ok(())
    }
    fn delete(&self, _: &SecretName) -> Result<(), SecretError> {
        Ok(())
    }
    fn get_origins(&self, _: &SecretName) -> Result<Option<String>, SecretError> {
        Ok(None)
    }
    fn set_origins(&self, _: &SecretName, _: &str) -> Result<(), SecretError> {
        Ok(())
    }
    fn delete_origins(&self, _: &SecretName) -> Result<(), SecretError> {
        Ok(())
    }
}
