//! The call on Windows, through the `windows` crate: the window's caption and
//! caption text colours (`DwmSetWindowAttribute`). Windows 11 (build 22000
//! and later) knows both attributes; Windows 10 answers an error and keeps
//! the system's title bar.

use windows::Win32::Foundation::{COLORREF, HWND};
use windows::Win32::Graphics::Dwm::{
    DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR, DWMWINDOWATTRIBUTE, DwmSetWindowAttribute,
};

use crate::{Rgb, colorref, text_colour};

/// See [`crate::set`].
pub fn set(window: *mut core::ffi::c_void, caption: Rgb) -> Result<(), String> {
    set_colour(window, DWMWA_CAPTION_COLOR, caption)
        .map_err(|error| format!("the title bar's colour: {error}"))?;
    set_colour(window, DWMWA_TEXT_COLOR, text_colour(caption))
        .map_err(|error| format!("the title text's colour: {error}"))
}

fn set_colour(
    window: *mut core::ffi::c_void,
    attribute: DWMWINDOWATTRIBUTE,
    colour: Rgb,
) -> windows::core::Result<()> {
    let value = COLORREF(colorref(colour));
    // SAFETY: Windows checks the handle itself and answers an error for one
    // that names no window. The value is a COLORREF that lives until after
    // the call, and the size passed is its own.
    unsafe {
        DwmSetWindowAttribute(
            HWND(window),
            attribute,
            (&raw const value).cast(),
            size_of::<COLORREF>() as u32,
        )
    }
}
