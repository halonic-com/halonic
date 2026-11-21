//! The paired-computer list, used off the async threads: each call reads
//! or writes files and may wait for the Android Keystore, which must not
//! hold up the runtime, and the list changes one computer at a time.

use std::sync::{Arc, Mutex, PoisonError};

use halonic_device_keys::{DeviceKeyError, DeviceKeyStore, PairedComputers};

/// The list, shared by the service and its connections.
pub(crate) struct Store<S: DeviceKeyStore + 'static>(Arc<Mutex<PairedComputers<S>>>);

impl<S: DeviceKeyStore + 'static> Clone for Store<S> {
    fn clone(&self) -> Self {
        Self(Arc::clone(&self.0))
    }
}

impl<S: DeviceKeyStore + 'static> Store<S> {
    pub(crate) fn new(computers: PairedComputers<S>) -> Self {
        Self(Arc::new(Mutex::new(computers)))
    }

    /// Runs `work` on a blocking thread, one call at a time. A thread that
    /// fails to run reads as the store being unavailable.
    pub(crate) async fn run<T: Send + 'static>(
        &self,
        work: impl FnOnce(&PairedComputers<S>) -> Result<T, DeviceKeyError> + Send + 'static,
    ) -> Result<T, DeviceKeyError> {
        let computers = Arc::clone(&self.0);
        tokio::task::spawn_blocking(move || {
            let computers = computers.lock().unwrap_or_else(PoisonError::into_inner);
            work(&computers)
        })
        .await
        .unwrap_or(Err(DeviceKeyError::Unavailable))
    }
}
