//! Who signed a file, as Windows' administrator prompt shows the publisher,
//! and the publisher a signed release is built for. The sandbox helper
//! checks the copy of itself it leaves for Installed apps with it
//! (HAL-7385, S-4), and the Studio shell checks the helper before it starts
//! it with `runas` (HAL-14958): one check, so the two can't read a
//! publisher differently.

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::{signer, signer_of_open};

/// The publisher a signed release's sandbox helper shows in the UAC prompt:
/// its signing certificate's name, as Windows displays it. The release
/// build sets `HALONIC_SANDBOX_SIGNER` (HAL-1197) for the app and the
/// programs it ships; dev and CI builds and an unsigned release leave it
/// out.
///
/// It is built in, not read from the helper's file: that file is in the
/// user's app folder, where another program can be put in its place, which
/// is the very swap the checks are for (HAL-7385, S-4).
pub const SIGNER: Option<&str> = option_env!("HALONIC_SANDBOX_SIGNER");
