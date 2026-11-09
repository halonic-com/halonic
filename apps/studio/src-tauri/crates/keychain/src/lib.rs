//! The Studio shell's desktop keychain (HAL-192, plan approved on
//! HAL-1508): the [`SecretBackend`] behind the `secret_*` commands on
//! macOS, Windows and Linux.
//!
//! Each secret is one keychain entry under the service `halonic` and its
//! canonical name, the entry the CLI uses for the same name (requirement
//! `desktop-keychain`). The `keyring` crate reaches the macOS Keychain, the
//! Windows Credential Manager or the Secret Service (GNOME Keyring,
//! KWallet).
//!
//! keyring 3 quietly keeps secrets in memory when it is built without a
//! platform feature, so they vanish when the app closes. This crate never
//! asks keyring for its default store: it names the platform's credential
//! type itself. On any other target it has no keyring at all, and every
//! call is `unavailable`.
//!
//! [`SecretBackend`]: halonic_secrets::SecretBackend

#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
mod platform;
#[cfg(all(
    test,
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
mod platform_tests;
#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
mod unsupported;

/// The desktop keychain. It holds nothing itself: every call opens the
/// entry it needs, so a keychain unlocked or installed while the app runs
/// is found on the next call.
#[derive(Debug, Default)]
pub struct DesktopKeychain;

impl DesktopKeychain {
    /// The keychain of the system the app runs on.
    pub fn new() -> Self {
        Self
    }
}
