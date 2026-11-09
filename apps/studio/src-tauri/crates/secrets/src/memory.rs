use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

use crate::backend::SecretBackend;
use crate::error::SecretError;
use crate::name::SecretName;

/// A backend that keeps secrets in memory, for tests. Nothing survives the
/// process, so the shell never uses it as a fallback.
#[derive(Debug, Default)]
pub struct MemoryBackend {
    values: Mutex<HashMap<String, String>>,
}

impl MemoryBackend {
    /// An empty backend.
    pub fn new() -> Self {
        Self::default()
    }
}

impl SecretBackend for MemoryBackend {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        let values = self.values.lock().unwrap_or_else(PoisonError::into_inner);
        Ok(values.get(name.as_str()).cloned())
    }

    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        let mut values = self.values.lock().unwrap_or_else(PoisonError::into_inner);
        values.insert(name.as_str().to_owned(), value.to_owned());
        Ok(())
    }

    fn delete(&self, name: &SecretName) -> Result<(), SecretError> {
        let mut values = self.values.lock().unwrap_or_else(PoisonError::into_inner);
        values.remove(name.as_str());
        Ok(())
    }
}
