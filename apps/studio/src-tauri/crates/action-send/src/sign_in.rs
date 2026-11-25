//! What a sign-in needs from the shell and what it hands back. A sign-in
//! runs only while its stepper is open (architecture note on HAL-17491,
//! 6.7): closing the stepper or the window cancels it through
//! [`SignInCancel`], and nothing it hasn't stored yet is kept.

use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};

use halonic_secrets::{SecretBackend, SecretError};
use serde::Serialize;

use crate::account::Account;

/// Cancels one sign-in. The shell keeps one for the sign-in that is running
/// and cancels it when the stepper or its window closes.
#[derive(Debug, Default)]
pub struct SignInCancel {
    cancelled: AtomicBool,
}

impl SignInCancel {
    /// Cancels the sign-in. It never waits: the shell cancels from its UI
    /// thread, and a keychain write can be held up by an unlock prompt for
    /// as long as the user leaves it open (Liam's review of HAL-18084). A
    /// write already under way still finishes, and the device flow then
    /// takes it back; none starts after this.
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    /// Whether the sign-in was cancelled.
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
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
