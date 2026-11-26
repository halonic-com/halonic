//! Gives one window its own taskbar identity (HAL-17903). Windows groups a
//! process's windows under one taskbar entry, the one its AppUserModelID
//! names. Halonic Inbox and Halonic Messenger are windows of the one
//! Halonic process, so each sets its own ID on its window; the Start menu
//! shortcut with the same ID (windows/installer.nsi) then gives that entry
//! its name and pins it. Each window also gets its app's small and large
//! icons (HAL-19716), so the entry shows the app's icon at its full size.

mod ico;

pub use ico::image_for;

#[cfg(windows)]
mod platform;

#[cfg(windows)]
pub use platform::WindowIcons;

/// Sets the AppUserModelID of the window `window` (its `HWND`) to `app_id`.
/// An error says what Windows answered; the window then stays in Halonic's
/// own taskbar entry.
#[cfg(windows)]
pub fn set(window: *mut core::ffi::c_void, app_id: &str) -> Result<(), String> {
    platform::set(window, app_id)
}

/// Sets the small and large icons of the window `window` (its `HWND`),
/// for a display of `dpi` dots per inch, from the images in `ico` (an .ico
/// file's bytes): for each, the image of the size Windows asks for there
/// (`SM_CXSMICON`, `SM_CXICON`), or the next bigger one. Without this the
/// window has only a small icon, shrunk from 64 px, and the taskbar takes
/// the large one from the exe, which is Halonic's. Keep the result while
/// the window uses the icons: dropping it destroys them. An error says what
/// Windows answered; the window keeps the icons it had.
#[cfg(windows)]
pub fn set_icons(
    window: *mut core::ffi::c_void,
    ico: &[u8],
    dpi: u32,
) -> Result<WindowIcons, String> {
    platform::set_icons(window, ico, dpi)
}
