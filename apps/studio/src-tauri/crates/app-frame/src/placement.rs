//! Each frame's place (`studio.src-tauri.window-place`): kept when it
//! closes, in the user's registry under `Software\Halonic\Frames`, one
//! value per app, and put back before it first shows. Windows moves a
//! place that is no longer on a connected screen back onto one. Window
//! managers such as FancyZones may then move it to the zone they keep for
//! the frame's exe.

use windows_sys::Win32::Foundation::{ERROR_SUCCESS, HWND, POINT, RECT};
use windows_sys::Win32::System::Registry::{
    HKEY_CURRENT_USER, REG_BINARY, RRF_RT_REG_BINARY, RegGetValueW, RegSetKeyValueW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetWindowPlacement, SW_SHOWMAXIMIZED, SW_SHOWNORMAL, SetWindowPlacement, WINDOWPLACEMENT,
};

use crate::{FrameApp, PLACEMENT_BYTES, Placement};

/// The registry key, under the current user, that keeps the places.
const KEY: &str = "Software\\Halonic\\Frames";

/// Puts `frame` where `app`'s frame last closed and shows it there. `false`
/// when no place was kept or Windows refused it; the frame is then hidden.
pub fn restore(frame: HWND, app: FrameApp) -> bool {
    let Some(placement) = read(app) else {
        return false;
    };
    let kept = WINDOWPLACEMENT {
        length: size_of::<WINDOWPLACEMENT>() as u32,
        flags: 0,
        showCmd: if placement.maximized {
            SW_SHOWMAXIMIZED as u32
        } else {
            SW_SHOWNORMAL as u32
        },
        ptMinPosition: POINT { x: -1, y: -1 },
        ptMaxPosition: POINT { x: -1, y: -1 },
        rcNormalPosition: RECT {
            left: placement.left,
            top: placement.top,
            right: placement.right,
            bottom: placement.bottom,
        },
    };
    // SAFETY: the frame's own window; the placement lives through the call.
    unsafe { SetWindowPlacement(frame, &kept) != 0 }
}

/// Keeps where `frame` is now as `app`'s frame's place. A place that can't
/// be read or kept is left out: the frame then opens where it last did.
pub fn save(frame: HWND, app: FrameApp) {
    let mut now = WINDOWPLACEMENT {
        length: size_of::<WINDOWPLACEMENT>() as u32,
        ..Default::default()
    };
    // SAFETY: the frame's own window; Windows fills the local placement.
    if unsafe { GetWindowPlacement(frame, &mut now) } == 0 {
        return;
    }
    let placement = Placement {
        maximized: now.showCmd == SW_SHOWMAXIMIZED as u32,
        left: now.rcNormalPosition.left,
        top: now.rcNormalPosition.top,
        right: now.rcNormalPosition.right,
        bottom: now.rcNormalPosition.bottom,
    };
    let bytes = placement.to_bytes();
    let key = wide(KEY);
    let name = wide(app.name());
    // SAFETY: the key, the name and the bytes live through the call; the
    // size passed is the bytes' own.
    unsafe {
        RegSetKeyValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            name.as_ptr(),
            REG_BINARY,
            bytes.as_ptr().cast(),
            PLACEMENT_BYTES as u32,
        )
    };
}

fn read(app: FrameApp) -> Option<Placement> {
    let key = wide(KEY);
    let name = wide(app.name());
    let mut bytes = [0u8; PLACEMENT_BYTES];
    let mut size = PLACEMENT_BYTES as u32;
    // SAFETY: the buffer holds `size` bytes; Windows writes no more and
    // refuses a bigger value, which `from_bytes` would drop anyway.
    let read = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_BINARY,
            std::ptr::null_mut(),
            bytes.as_mut_ptr().cast(),
            &mut size,
        )
    };
    if read != ERROR_SUCCESS {
        return None;
    }
    Placement::from_bytes(&bytes[..size as usize])
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}
