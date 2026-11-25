//! Windows: copies the screen's pixels with GDI. The shell is aware of each
//! screen's own scale (Tauri sets per-monitor DPI awareness), so the area's
//! device pixels are the desktop's coordinates here.

use ::windows::Win32::Graphics::Gdi::{
    BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BitBlt, CAPTUREBLT, CreateCompatibleBitmap,
    CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDC, GetDIBits, HBITMAP, HDC,
    HGDIOBJ, ReleaseDC, SRCCOPY, SelectObject,
};

use crate::{ScreenArea, Still, StillError, still_from_bgra_rows};

/// The desktop's drawing context and the in-memory copy, released in
/// reverse order however `take` ends.
struct ScreenCopy {
    screen: HDC,
    memory: HDC,
    bitmap: HBITMAP,
    previous: HGDIOBJ,
}

impl Drop for ScreenCopy {
    fn drop(&mut self) {
        // SAFETY: each handle was created in `take` and is released once,
        // here; the bitmap is selected out before it is deleted.
        unsafe {
            SelectObject(self.memory, self.previous);
            let _ = DeleteObject(self.bitmap.into());
            let _ = DeleteDC(self.memory);
            ReleaseDC(None, self.screen);
        }
    }
}

/// Copies `area` of the desktop, top row first.
pub(crate) fn take(area: &ScreenArea) -> Result<Still, StillError> {
    let width = i32::try_from(area.width).map_err(|_| failed("width"))?;
    let height = i32::try_from(area.height).map_err(|_| failed("height"))?;
    // SAFETY: GetDC(None) is the whole desktop's context; the others take
    // the handles just made, and `ScreenCopy` releases all of them.
    let copy = unsafe {
        let screen = GetDC(None);
        if screen.is_invalid() {
            return Err(failed("GetDC"));
        }
        let memory = CreateCompatibleDC(Some(screen));
        let bitmap = CreateCompatibleBitmap(screen, width, height);
        let previous = SelectObject(memory, bitmap.into());
        ScreenCopy {
            screen,
            memory,
            bitmap,
            previous,
        }
    };
    if copy.memory.is_invalid() || copy.bitmap.is_invalid() {
        return Err(failed("CreateCompatibleBitmap"));
    }
    // SAFETY: both contexts are live; CAPTUREBLT includes layered windows,
    // so the still matches what the person sees.
    unsafe {
        BitBlt(
            copy.memory,
            0,
            0,
            width,
            height,
            Some(copy.screen),
            area.left,
            area.top,
            SRCCOPY | CAPTUREBLT,
        )
    }
    .map_err(|error| failed(&format!("BitBlt: {error}")))?;
    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            // Negative: rows top first.
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let stride = area.width as usize * 4;
    let mut bytes = vec![0u8; stride * area.height as usize];
    // SAFETY: GetDIBits needs the bitmap selected out of every context, so
    // the old object goes back first (`ScreenCopy` selecting it again is
    // harmless). `bytes` holds exactly `height` rows of 32-bit pixels,
    // which is what `info` asks for.
    let rows = unsafe {
        SelectObject(copy.memory, copy.previous);
        GetDIBits(
            copy.memory,
            copy.bitmap,
            0,
            area.height,
            Some(bytes.as_mut_ptr().cast()),
            &mut info,
            DIB_RGB_COLORS,
        )
    };
    if rows != height {
        return Err(failed("GetDIBits"));
    }
    drop(copy);
    still_from_bgra_rows(&bytes, area.width, area.height, stride).ok_or_else(|| failed("rows"))
}

fn failed(call: &str) -> StillError {
    StillError::Failed(call.to_owned())
}
