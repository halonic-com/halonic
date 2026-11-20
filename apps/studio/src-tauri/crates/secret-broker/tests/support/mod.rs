//! Backends and trust answers for the broker's tests.

// Each test file is its own crate and uses only part of this module.
#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex, PoisonError};

use halonic_secret_broker::WorkspaceTrust;
use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};

/// A folder of its own for one test, under the system's temporary folder,
/// removed when the test ends.
pub struct Scratch(PathBuf);

impl Scratch {
    pub fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("secret-broker-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the scratch folder can be created");
        Self(folder)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// A trust answer the test switches.
#[derive(Default)]
pub struct SwitchedTrust(pub AtomicBool);

impl SwitchedTrust {
    pub fn trusted() -> Arc<Self> {
        Arc::new(Self(AtomicBool::new(true)))
    }

    pub fn revoke(&self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

impl WorkspaceTrust for SwitchedTrust {
    fn is_trusted(&self) -> Result<bool, String> {
        Ok(self.0.load(Ordering::SeqCst))
    }
}

/// A memory backend that counts its reads.
#[derive(Default)]
pub struct CountingBackend {
    pub inner: MemoryBackend,
    pub reads: AtomicUsize,
}

impl CountingBackend {
    pub fn with(name: &str, value: &str) -> Arc<Self> {
        let backend = Self::default();
        let name = SecretName::parse(name).expect("a valid name");
        backend.inner.set(&name, value).expect("stores");
        Arc::new(backend)
    }

    pub fn reads(&self) -> usize {
        self.reads.load(Ordering::SeqCst)
    }
}

impl SecretBackend for CountingBackend {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.reads.fetch_add(1, Ordering::SeqCst);
        self.inner.get(name)
    }

    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        self.inner.set(name, value)
    }

    fn delete(&self, name: &SecretName) -> Result<(), SecretError> {
        self.inner.delete(name)
    }

    fn get_origins(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.reads.fetch_add(1, Ordering::SeqCst);
        self.inner.get_origins(name)
    }

    fn set_origins(&self, name: &SecretName, origins: &str) -> Result<(), SecretError> {
        self.inner.set_origins(name, origins)
    }

    fn delete_origins(&self, name: &SecretName) -> Result<(), SecretError> {
        self.inner.delete_origins(name)
    }
}

/// A backend whose reads wait until the test opens the gate, like a
/// keychain showing an unlock prompt. Each read reports on `entered` first.
pub struct GatedBackend {
    entered: Mutex<Sender<()>>,
    gate: Mutex<Receiver<()>>,
}

impl GatedBackend {
    /// The backend, the receiver of its "entered" reports, and the gate:
    /// each `()` sent through it lets one read finish.
    pub fn closed() -> (Arc<Self>, Receiver<()>, Sender<()>) {
        let (entered, entered_reports) = channel();
        let (gate_opener, gate) = channel();
        let backend = Self {
            entered: Mutex::new(entered),
            gate: Mutex::new(gate),
        };
        (Arc::new(backend), entered_reports, gate_opener)
    }
}

impl SecretBackend for GatedBackend {
    fn get(&self, _name: &SecretName) -> Result<Option<String>, SecretError> {
        let entered = self.entered.lock().unwrap_or_else(PoisonError::into_inner);
        // Reads still stuck when the test ends find nobody listening.
        let _test_may_have_ended = entered.send(());
        drop(entered);
        let gate = self.gate.lock().unwrap_or_else(PoisonError::into_inner);
        // A closed gate (the test ended) also lets the read finish.
        let _opened_or_closed = gate.recv();
        Ok(Some("gated-value".to_owned()))
    }

    fn set(&self, _name: &SecretName, _value: &str) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }

    fn delete(&self, _name: &SecretName) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }

    fn get_origins(&self, _name: &SecretName) -> Result<Option<String>, SecretError> {
        Ok(None)
    }

    fn set_origins(&self, _name: &SecretName, _origins: &str) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }

    fn delete_origins(&self, _name: &SecretName) -> Result<(), SecretError> {
        Err(SecretError::Unavailable)
    }
}
