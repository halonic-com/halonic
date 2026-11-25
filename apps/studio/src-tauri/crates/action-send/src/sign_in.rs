//! What a sign-in needs from the shell and what it hands back. A sign-in
//! runs only while its stepper is open (architecture note on HAL-17491,
//! 6.7): closing the stepper or the window cancels it through
//! [`SignInCancel`], and nothing it hasn't stored yet is kept.

use std::future::Future;
use std::sync::{Mutex, PoisonError};

use halonic_secrets::{SecretBackend, SecretError};
use serde::Serialize;

use crate::account::Account;

/// Cancels one sign-in. The shell keeps one for the sign-in that is running
/// and cancels it when the stepper or its window closes.
#[derive(Debug, Default)]
pub struct SignInCancel {
    cancelled: Mutex<bool>,
}

impl SignInCancel {
    /// Cancels the sign-in. If it is storing its token right now, this
    /// waits until that is done, so afterwards nothing more is written.
    pub fn cancel(&self) {
        *self
            .cancelled
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = true;
    }

    /// Whether the sign-in was cancelled.
    pub fn is_cancelled(&self) -> bool {
        *self
            .cancelled
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    /// Runs `write` unless the sign-in was cancelled, holding the flag so a
    /// cancel can't come in between the check and the write. `None` when it
    /// was cancelled and nothing ran.
    pub fn unless_cancelled<T>(&self, write: impl FnOnce() -> T) -> Option<T> {
        let cancelled = self
            .cancelled
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        (!*cancelled).then(write)
    }
}

/// The keychain, reached off the UI thread: the OS keychain may ask the
/// user to unlock it.
pub trait Keychain {
    /// Runs `call` with the keychain's backend.
    fn with_backend<T, F>(&self, call: F) -> impl Future<Output = Result<T, SecretError>> + Send
    where
        T: Send + 'static,
        F: FnOnce(&dyn SecretBackend) -> Result<T, SecretError> + Send + 'static;
}

/// Seconds since 1970, and waiting between polls.
pub trait Clock {
    /// Seconds since 1970.
    fn now(&self) -> u64;
    /// Waits `seconds`. The shell's wait ends early when the sign-in is
    /// cancelled.
    fn pause(&self, seconds: u64) -> impl Future<Output = ()> + Send;
}

/// The code the user types on the service's sign-in page.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserCode {
    pub code: String,
    /// The page where the user types it, fixed by the shell.
    pub page: &'static str,
    /// Seconds until the code stops working.
    pub expires_in: u64,
}

/// Where the shell shows the code: in the stepper, which then opens the
/// sign-in page in the user's browser.
pub trait CodeScreen {
    /// Shows the code and opens its page.
    fn show(&self, code: &UserCode);
}

/// What a sign-in did: `ActionSignInResult` in `@halonicjs/ports`, plus
/// `failed`, with a sentence for the user that never holds a token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "outcome", rename_all = "kebab-case")]
pub enum SignInResult {
    SignedIn { account: Account },
    Cancelled,
    NotAvailable,
    Failed { reason: String },
}

impl SignInResult {
    pub(crate) fn failed(reason: &str) -> Self {
        Self::Failed {
            reason: reason.to_owned(),
        }
    }
}

/// Text that held a token or a device code: its bytes are overwritten with
/// zeros when it is dropped, so they don't linger in freed memory (note,
/// 6.7).
#[derive(Default)]
pub(crate) struct Wiped(pub(crate) Vec<u8>);

impl Drop for Wiped {
    fn drop(&mut self) {
        self.0.fill(0);
        // Keeps the zeros from being optimised away as a dead write.
        std::hint::black_box(&self.0);
    }
}

impl Wiped {
    pub(crate) fn text(text: String) -> Self {
        Self(text.into_bytes())
    }

    pub(crate) fn as_str(&self) -> &str {
        std::str::from_utf8(&self.0).unwrap_or_default()
    }
}
