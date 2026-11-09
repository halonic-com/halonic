//! The `secret_get`, `secret_set` and `secret_delete` commands, the page's
//! way to the keychain (HAL-192, interface agreed with Priya on HAL-229).
//! The name and value rules live in the `halonic-secrets` crate and the
//! desktop keychain in `halonic-keychain`; this file only runs the calls
//! off the main thread and shapes the answers.

use std::sync::Arc;

use halonic_keychain::DesktopKeychain;
use halonic_secrets::{SecretBackend, SecretError, delete_secret, get_secret, set_secret};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

/// The shell's keychain. On Android it is `unavailable` until the Android
/// Keystore backend (HAL-1211) replaces it there.
pub struct SecretsState {
    backend: Arc<dyn SecretBackend>,
}

impl Default for SecretsState {
    fn default() -> Self {
        Self {
            backend: Arc::new(DesktopKeychain::new()),
        }
    }
}

/// Why a call failed: a stable `kind` for the page to pick its words by
/// (see `SecretError::kind`), and a message for the log. Neither holds the
/// value.
#[derive(Debug, Serialize)]
pub struct SecretRefusal {
    kind: &'static str,
    message: String,
}

impl From<SecretError> for SecretRefusal {
    fn from(error: SecretError) -> Self {
        Self {
            kind: error.kind(),
            message: error.to_string(),
        }
    }
}

/// Runs one keychain call on a worker thread: the keychain may ask the user
/// to unlock it, and that must not hold up the UI.
async fn on_worker<R, T, F>(app: &AppHandle<R>, call: F) -> Result<T, SecretRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(&dyn SecretBackend) -> Result<T, SecretError> + Send + 'static,
{
    let backend = Arc::clone(&app.state::<SecretsState>().backend);
    let answer = tauri::async_runtime::spawn_blocking(move || call(backend.as_ref()))
        .await
        .map_err(|error| SecretError::Backend {
            message: error.to_string(),
        })?;
    Ok(answer?)
}

/// The secret's value, or `null` when nothing is stored under the name.
#[tauri::command]
pub async fn secret_get<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<Option<String>, SecretRefusal> {
    on_worker(&app, move |backend| get_secret(backend, &name)).await
}

/// Stores the value under the name, replacing any value already there.
#[tauri::command]
pub async fn secret_set<R: Runtime>(
    app: AppHandle<R>,
    name: String,
    value: String,
) -> Result<(), SecretRefusal> {
    on_worker(&app, move |backend| set_secret(backend, &name, &value)).await
}

/// Removes the value. Removing a name that holds nothing succeeds.
#[tauri::command]
pub async fn secret_delete<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<(), SecretRefusal> {
    on_worker(&app, move |backend| delete_secret(backend, &name)).await
}
