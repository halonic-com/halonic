//! The phone's owner check (HAL-15194, board decision 4b, D7 section 2):
//! before the phone answers an approval, the person proves it's them with a
//! strong biometric, fresh for every answer.
//!
//! - [`OwnerCheck`]: the port. Says whether the phone can check at all, and
//!   asks once.
//! - [`Availability`] and [`Confirmation`]: its answers. Anything the
//!   platform says that isn't one of them reads as unavailable, so a
//!   surprise never lets an answer through.
//! - [`Decision`] and [`PromptWords`]: the prompt says only fixed words the
//!   shell picks from the decision. No page and no host text goes into it.
//! - [`FakeOwnerCheck`]: for tests.
//!
//! The shell's Android adapter (`owner_check`, `OwnerCheckPlugin.kt`) puts
//! Android's own `BiometricPrompt` behind the port, with strong (Class 3)
//! biometrics only. This crate holds no Tauri types.

mod answers;
mod check;
mod fake;
mod prompt;

#[cfg(test)]
mod answers_tests;
#[cfg(test)]
mod fake_tests;

pub use answers::{Availability, Confirmation};
pub use check::OwnerCheck;
pub use fake::FakeOwnerCheck;
pub use prompt::{Decision, PromptWords};
