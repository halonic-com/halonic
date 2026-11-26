//! The calls on Windows, through the `windows` crate: the window's property
//! store (`SHGetPropertyStoreForWindow`) with `System.AppUserModel.ID` set,
//! and the window's small and large icons (`WM_SETICON`).

use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::UI::HiDpi::GetSystemMetricsForDpi;
use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateIconFromResourceEx, DestroyIcon, HICON, ICON_BIG, ICON_SMALL, LR_DEFAULTCOLOR, SM_CXICON,
    SM_CXSMICON, SYSTEM_METRICS_INDEX, SendMessageW, WM_SETICON,
};

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

/// An icon this crate made, destroyed when dropped.
struct OwnedIcon(HICON);

impl Drop for OwnedIcon {
    fn drop(&mut self) {
        // SAFETY: the handle came from `CreateIconFromResourceEx` and is
        // destroyed only here, once. A failure means Windows already freed
        // it with the process's last window, and there's no one to tell.
        let _ = unsafe { DestroyIcon(self.0) };
    }
}

/// A window's small and large icons, from [`crate::set_icons`]. Dropping
/// it destroys them, so keep it until the window has other icons or is gone.
pub struct WindowIcons {
    _small: OwnedIcon,
    _big: OwnedIcon,
}

// SAFETY: icon handles belong to the process, not to a thread: any thread
// may destroy one, which is all `WindowIcons` does with them.
unsafe impl Send for WindowIcons {}

/// See [`crate::set_icons`].
pub fn set_icons(
    window: *mut core::ffi::c_void,
    ico: &[u8],
    dpi: u32,
) -> Result<WindowIcons, String> {
    let small = icon_at(ico, SM_CXSMICON, dpi)?;
    let big = icon_at(ico, SM_CXICON, dpi)?;
    for (kind, icon) in [(ICON_SMALL, &small), (ICON_BIG, &big)] {
        // SAFETY: Windows checks the handle itself; the icon stays alive in
        // the `WindowIcons` returned. The answer is the icon set before,
        // which its owner (tao, or an earlier `WindowIcons`) destroys.
        unsafe {
            SendMessageW(
                HWND(window),
                WM_SETICON,
                Some(WPARAM(kind as usize)),
                Some(LPARAM(icon.0.0 as isize)),
            )
        };
    }
    Ok(WindowIcons {
        _small: small,
        _big: big,
    })
}

/// The icon of the size `metric` names at `dpi`, from `ico`'s image of
/// that size or the next bigger one.
fn icon_at(ico: &[u8], metric: SYSTEM_METRICS_INDEX, dpi: u32) -> Result<OwnedIcon, String> {
    // SAFETY: a query with no pointers; it answers 0 for a metric it lacks.
    let pixels = unsafe { GetSystemMetricsForDpi(metric, dpi) };
    let wanted = u32::try_from(pixels)
        .ok()
        .filter(|&wanted| wanted > 0)
        .ok_or_else(|| format!("Windows gave no icon size at {dpi} dpi"))?;
    let image = crate::ico::image_for(ico, wanted).ok_or("the app's .ico holds no image")?;
    // 0x0003_0000 is the icon format every Windows since 3.0 reads, PNGs
    // included. SAFETY: the image's bytes live through the call; Windows
    // copies them into the icon it returns, which `OwnedIcon` destroys.
    let icon = unsafe {
        CreateIconFromResourceEx(image, true, 0x0003_0000, pixels, pixels, LR_DEFAULTCOLOR)
    }
    .map_err(|error| format!("the window's {wanted} px icon: {error}"))?;
    Ok(OwnedIcon(icon))
}
