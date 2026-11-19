//! The `secret_get`, `secret_has`, `secret_set` and `secret_delete` commands, the page's
//! way to the keychain (HAL-192, interface agreed with Priya on HAL-229),
//! `secret_allowed_origins` and `secret_allow_origin` for the origins a key
//! may be sent to (HAL-11887), and `token_get`, `token_set` and
//! `token_delete`, its only way to a token. The secret commands refuse
//! Halonic's own names, tokens included.
//! The name and value rules live in the `halonic-secrets` crate and the
//! desktop keychain in `halonic-keychain`; this file only runs the calls
//! off the main thread and shapes the answers.

use std::sync::{Arc, Mutex, PoisonError};

use halonic_keychain::DesktopKeychain;
use halonic_secrets::{
    AllowOrigin, SecretBackend, SecretError, allow_origin, allowed_origins, delete_secret,
    delete_token, get_secret, get_token, has_secret, set_secret, set_token,
};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use url::Url;

/// The shell's keychain. On Android it is `unavailable` until the Android
/// Keystore backend (HAL-1211) replaces it there.
pub struct SecretsState {
    backend: Arc<dyn SecretBackend>,
    /// Held by every call that changes a key or its origins. Allowing an
    /// origin reads the list and writes it back, so without it two calls could
    /// lose one origin, or a key deleted in between could leave a list behind.
    changes: Arc<Mutex<()>>,
}

impl Default for SecretsState {
    fn default() -> Self {
        Self {
            backend: Arc::new(DesktopKeychain::new()),
            changes: Arc::default(),
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
/// to unlock it, and that must not hold up the UI. A failure goes to the
/// shell's log by `command` and kind, never with the value.
async fn on_worker<R, T, F>(
    app: &AppHandle<R>,
    command: &'static str,
    call: F,
) -> Result<T, SecretRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(&dyn SecretBackend) -> Result<T, SecretError> + Send + 'static,
{
    let backend = Arc::clone(&app.state::<SecretsState>().backend);
    let answer = tauri::async_runtime::spawn_blocking(move || call(backend.as_ref()))
        .await
        .unwrap_or_else(|error| {
            Err(SecretError::Backend {
                message: error.to_string(),
            })
        });
    answer.map_err(|error| {
        halonic_shell_log::record("keychain", error.log_message(command));
        SecretRefusal::from(error)
    })
}

/// Runs one call that changes a key or its origins on a worker thread, after
/// every other such call has finished.
async fn on_worker_alone<R, T, F>(
    app: &AppHandle<R>,
    command: &'static str,
    call: F,
) -> Result<T, SecretRefusal>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(&dyn SecretBackend) -> Result<T, SecretError> + Send + 'static,
{
    let changes = Arc::clone(&app.state::<SecretsState>().changes);
    on_worker(app, command, move |backend| {
        let _alone = changes.lock().unwrap_or_else(PoisonError::into_inner);
        call(backend)
    })
    .await
}

/// The secret's value, or `null` when nothing is stored under the name.
#[tauri::command]
pub async fn secret_get<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<Option<String>, SecretRefusal> {
    on_worker(&app, "secret_get", move |backend| {
        get_secret(backend, &name)
    })
    .await
}

/// Whether a value is stored under the name. The page asks this to show
/// "Set" or "Not set"; the answer holds no value.
#[tauri::command]
pub async fn secret_has<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<bool, SecretRefusal> {
    on_worker(&app, "secret_has", move |backend| {
        has_secret(backend, &name)
    })
    .await
}

/// Stores the value under the name, replacing any value already there.
#[tauri::command]
pub async fn secret_set<R: Runtime>(
    app: AppHandle<R>,
    name: String,
    value: String,
) -> Result<(), SecretRefusal> {
    on_worker_alone(&app, "secret_set", move |backend| {
        set_secret(backend, &name, &value)
    })
    .await
}

/// Removes the value and the origins it was allowed to go to. Removing a
/// name that holds nothing succeeds.
#[tauri::command]
pub async fn secret_delete<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<(), SecretRefusal> {
    on_worker_alone(&app, "secret_delete", move |backend| {
        delete_secret(backend, &name)
    })
    .await
}

/// The origins the key may be sent to, or `null` when none is recorded. Each
/// is written as `new URL(…).origin` writes it. A stored origin that isn't
/// one any more is refused with `backend`, so a changed list is never used.
#[tauri::command]
pub async fn secret_allowed_origins<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<Option<Vec<String>>, SecretRefusal> {
    const COMMAND: &str = "secret_allowed_origins";
    let origins = on_worker(&app, COMMAND, move |backend| {
        allowed_origins(backend, &name)
    })
    .await?;
    if let Some(origins) = &origins
        && !origins
            .iter()
            .all(|origin| origin_of(origin).is_ok_and(|parsed| &parsed == origin))
    {
        let error = SecretError::Backend {
            message: "the key's allowed origins are not a list Halonic wrote".to_owned(),
        };
        halonic_shell_log::record("keychain", error.log_message(COMMAND));
        return Err(error.into());
    }
    Ok(origins)
}

/// What `secret_allow_origin` did, in the shape of `AddOriginResult` in
/// `@halonicjs/adapter-secrets-file`, so the page reads the CLI's outcomes.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "result", rename_all = "kebab-case")]
pub enum AllowOriginAnswer {
    /// The origin was added to the key's list.
    Added { origin: String },
    /// The origin was already on the list.
    AlreadyAllowed { origin: String },
    /// No key is stored under the name.
    NoKey,
    /// The list is full.
    Full,
    /// The address can't be an allowed origin.
    BadAddress { problem: AddressProblem },
}

/// Why an address can't be an allowed origin, as `AddressProblem` in
/// `@halonicjs/adapter-secrets-file`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AddressProblem {
    /// Not an `http` or `https` address.
    NotAnAddress,
    /// The address holds a user name or a password.
    HasUserInfo,
}

/// Adds the origin of `address` (its scheme, host and port) to the ones the
/// key may be sent to, keeping the others. The shell makes the origin, so the
/// page can't store anything but one.
#[tauri::command]
pub async fn secret_allow_origin<R: Runtime>(
    app: AppHandle<R>,
    name: String,
    address: String,
) -> Result<AllowOriginAnswer, SecretRefusal> {
    let origin = match origin_of(&address) {
        Ok(origin) => origin,
        Err(problem) => return Ok(AllowOriginAnswer::BadAddress { problem }),
    };
    let outcome = {
        let origin = origin.clone();
        on_worker_alone(&app, "secret_allow_origin", move |backend| {
            allow_origin(backend, &name, &origin)
        })
        .await?
    };
    Ok(match outcome {
        AllowOrigin::Added => AllowOriginAnswer::Added { origin },
        AllowOrigin::AlreadyAllowed => AllowOriginAnswer::AlreadyAllowed { origin },
        AllowOrigin::NoKey => AllowOriginAnswer::NoKey,
        AllowOrigin::Full => AllowOriginAnswer::Full,
    })
}

/// The origin of an address as `new URL(…).origin` writes it (both follow the
/// WHATWG URL standard), the same form the CLI stores and the model resolver
/// compares as a whole string.
pub(crate) fn origin_of(address: &str) -> Result<String, AddressProblem> {
    let url = Url::parse(address).map_err(|_| AddressProblem::NotAnAddress)?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err(AddressProblem::NotAnAddress);
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(AddressProblem::HasUserInfo);
    }
    Ok(url.origin().ascii_serialization())
}

/// The token, or `null` when nothing is stored under the name. The shell
/// adds the token prefix; the page names the token only.
#[tauri::command]
pub async fn token_get<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<Option<String>, SecretRefusal> {
    on_worker(&app, "token_get", move |backend| get_token(backend, &name)).await
}

/// Stores the token, replacing any token already there.
#[tauri::command]
pub async fn token_set<R: Runtime>(
    app: AppHandle<R>,
    name: String,
    value: String,
) -> Result<(), SecretRefusal> {
    on_worker(&app, "token_set", move |backend| {
        set_token(backend, &name, &value)
    })
    .await
}

/// Removes the token. Removing a token that isn't stored succeeds.
#[tauri::command]
pub async fn token_delete<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<(), SecretRefusal> {
    on_worker(&app, "token_delete", move |backend| {
        delete_token(backend, &name)
    })
    .await
}

#[cfg(test)]
#[path = "secrets_tests.rs"]
mod tests;
