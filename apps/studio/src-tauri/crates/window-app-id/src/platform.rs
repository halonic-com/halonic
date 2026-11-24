//! The call on Windows, through the `windows` crate: the window's property
//! store (`SHGetPropertyStoreForWindow`) with `System.AppUserModel.ID` set.

use windows::Win32::Foundation::HWND;
use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow};

/// See [`crate::set`].
pub fn set(window: *mut core::ffi::c_void, app_id: &str) -> Result<(), String> {
    // SAFETY: Windows checks the handle itself and answers an error for one
    // that names no window; the store it returns is released on drop.
    let store: IPropertyStore = unsafe { SHGetPropertyStoreForWindow(HWND(window)) }
        .map_err(|error| format!("the window's property store: {error}"))?;
    let value = PROPVARIANT::from(app_id);
    // SAFETY: the key is a constant and the value lives until after the
    // call; the store copies it.
    unsafe { store.SetValue(&PKEY_AppUserModel_ID, &value) }
        .map_err(|error| format!("setting the window's AppUserModelID: {error}"))?;
    // SAFETY: a call on the store obtained above, which is still held.
    unsafe { store.Commit() }
        .map_err(|error| format!("saving the window's AppUserModelID: {error}"))
}
