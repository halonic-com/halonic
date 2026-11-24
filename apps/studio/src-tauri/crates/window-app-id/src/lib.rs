//! Gives one window its own taskbar identity (HAL-17903). Windows groups a
//! process's windows under one taskbar entry, the one its AppUserModelID
//! names. Halonic Inbox and Halonic Messenger are windows of the one
//! Halonic process, so each sets its own ID on its window; the Start menu
//! shortcut with the same ID (windows/installer.nsi) then gives that entry
//! its name and pins it.

#[cfg(windows)]
mod platform;

/// Sets the AppUserModelID of the window `window` (its `HWND`) to `app_id`.
/// An error says what Windows answered; the window then stays in Halonic's
/// own taskbar entry.
#[cfg(windows)]
pub fn set(window: *mut core::ffi::c_void, app_id: &str) -> Result<(), String> {
    platform::set(window, app_id)
}
