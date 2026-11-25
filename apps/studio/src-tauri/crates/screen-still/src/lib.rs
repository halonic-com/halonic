//! One still picture of one screen, for the feedback shortcut (HAL-18778).
//! The shell takes it when the person presses the shortcut, shows it under
//! the selection overlay, crops the box they draw and drops the rest. It
//! lives in memory only: nothing here writes a file.
//!
//! Turning the system's rows into RGBA and cropping are plain functions
//! that build and test anywhere; only reading the screen is per system.

#[cfg(windows)]
mod gdi;
#[cfg(target_os = "linux")]
mod x11;
#[cfg(windows)]
use gdi::take as platform_take;
#[cfg(target_os = "linux")]
use x11::take as platform_take;

/// Any other system: no still yet. On macOS, CoreGraphics' capture is
/// obsolete from macOS 15 on, and ScreenCaptureKit is its own change.
#[cfg(not(any(windows, target_os = "linux")))]
fn platform_take(_area: &ScreenArea) -> Result<Still, StillError> {
    Err(StillError::Unavailable)
}

/// One screen as the shell's windows see it: its top-left corner on the
/// desktop and its size, in device pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ScreenArea {
    pub left: i32,
    pub top: i32,
    pub width: u32,
    pub height: u32,
}

/// A picture in memory: rows of RGBA, top row first, four bytes a pixel.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Still {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

/// A box inside a still, in its pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CropBox {
    pub left: u32,
    pub top: u32,
    pub width: u32,
    pub height: u32,
}

/// Why no still was taken.
#[derive(Debug, PartialEq, Eq)]
pub enum StillError {
    /// This system has no way in yet, such as macOS or Linux on Wayland.
    Unavailable,
    /// The system call failed; the text says which one.
    Failed(String),
}

impl std::fmt::Display for StillError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unavailable => formatter.write_str("screen capture is not available here"),
            Self::Failed(reason) => write!(formatter, "screen capture failed: {reason}"),
        }
    }
}

impl std::error::Error for StillError {}

/// Takes one still of `area`.
pub fn take(area: &ScreenArea) -> Result<Still, StillError> {
    platform_take(area)
}

impl Still {
    /// The part of the still inside `crop`, or `None` when the box is
    /// empty or reaches outside the still.
    pub fn crop(&self, crop: CropBox) -> Option<Still> {
        let right = crop.left.checked_add(crop.width)?;
        let bottom = crop.top.checked_add(crop.height)?;
        if crop.width == 0 || crop.height == 0 || right > self.width || bottom > self.height {
            return None;
        }
        let row_bytes = crop.width as usize * 4;
        let mut rgba = Vec::with_capacity(row_bytes * crop.height as usize);
        for row in crop.top..bottom {
            let start = (row as usize * self.width as usize + crop.left as usize) * 4;
            rgba.extend_from_slice(self.rgba.get(start..start + row_bytes)?);
        }
        Some(Still {
            width: crop.width,
            height: crop.height,
            rgba,
        })
    }
}

/// Rows of 32-bit BGRA or BGRX pixels, `stride` bytes apart, as a still:
/// the order Windows' GDI and X11 at depth 24 hand back. The fourth
/// byte is ignored, because a screen has nothing behind it, so every pixel
/// is opaque. `None` when `bytes` is too short for the size.
pub fn still_from_bgra_rows(bytes: &[u8], width: u32, height: u32, stride: usize) -> Option<Still> {
    let row_bytes = width as usize * 4;
    if stride < row_bytes {
        return None;
    }
    let mut rgba = Vec::with_capacity(row_bytes * height as usize);
    for row in 0..height as usize {
        let start = row * stride;
        let pixels = bytes.get(start..start + row_bytes)?;
        for [blue, green, red, _] in pixels.as_chunks::<4>().0 {
            rgba.extend_from_slice(&[*red, *green, *blue, 0xff]);
        }
    }
    Some(Still {
        width,
        height,
        rgba,
    })
}

#[cfg(test)]
mod tests;
