use std::future::Future;

use crate::answers::{Availability, Confirmation};
use crate::prompt::Decision;

/// The phone's owner check: one prompt for one answer. The port itself
/// remembers nothing between checks; `halonic-phone-tunnel` decides when a
/// pass for an inbox answer still covers the next one (requirement
/// `phone-answer-confirm`), and an answer to an approval always asks.
///
/// - **Android:** the shell's `owner_check` module, through
///   `OwnerCheckPlugin.kt` and Android's own `BiometricPrompt`, strong
///   (Class 3) biometrics only, Android 11 and later; for an inbox answer
///   the phone's PIN, pattern or password too.
/// - **iOS** (later): `LAContext` with biometrics only.
pub trait OwnerCheck: Send + Sync {
    /// Whether [`Self::confirm`] can ask now for `decision`, without asking:
    /// for an inbox answer the phone's PIN, pattern or password counts, for
    /// an approval only a strong biometric does.
    fn availability(&self, decision: Decision) -> impl Future<Output = Availability> + Send;

    /// Shows the prompt for `decision` and waits for the person. Only
    /// [`Confirmation::Confirmed`] means they passed it.
    fn confirm(&self, decision: Decision) -> impl Future<Output = Confirmation> + Send;

    /// How many times the app has left the screen since it started: gone to
    /// the background, or the screen turned off or locked. `None` when the
    /// phone can't tell, which counts as having left.
    fn times_away(&self) -> impl Future<Output = Option<u64>> + Send;
}
