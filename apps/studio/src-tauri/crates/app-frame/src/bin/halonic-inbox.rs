//! Halonic Inbox's frame (HAL-20468): the installer ships it as
//! `Halonic Inbox.exe`, and its Start menu shortcut starts it.

// No console window next to the frame in Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    halonic_app_frame::run(halonic_app_frame::FrameApp::Inbox)
}

/// The frames are Windows only: elsewhere window managers tell Halonic's
/// windows apart by their own, and the exe does nothing.
#[cfg(not(windows))]
fn main() {}
