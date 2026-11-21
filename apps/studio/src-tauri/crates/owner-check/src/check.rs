use std::future::Future;

use crate::answers::{Availability, Confirmation};
use crate::prompt::Decision;

/// The phone's owner check: a strong biometric, asked fresh for every
/// answer. Nothing is remembered between checks, so a pass never covers a
/// later answer.
///
/// - **Android:** the shell's `owner_check` module, through
///   `OwnerCheckPlugin.kt` and Android's own `BiometricPrompt`, strong
///   (Class 3) biometrics only, Android 11 and later.
/// - **iOS** (later): `LAContext` with biometrics only.
pub trait OwnerCheck: Send + Sync {
    /// Whether [`Self::confirm`] can ask now, without asking.
    fn availability(&self) -> impl Future<Output = Availability> + Send;

    /// Shows the prompt for `decision` and waits for the person. Only
    /// [`Confirmation::Confirmed`] means they passed it.
    fn confirm(&self, decision: Decision) -> impl Future<Output = Confirmation> + Send;
}
