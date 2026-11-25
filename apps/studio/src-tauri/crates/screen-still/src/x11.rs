//! Linux: reads the root window over X11's core protocol. On Wayland the
//! X server only sees its own clients' windows, so a still from it would
//! be mostly black: there it is `Unavailable` until the desktop portal
//! path comes.

use x11rb::connection::Connection;
use x11rb::protocol::xproto::{ConnectionExt, ImageFormat, ImageOrder};

use crate::{ScreenArea, Still, StillError, still_from_bgra_rows};

/// Reads `area` of the root window.
pub(crate) fn take(area: &ScreenArea) -> Result<Still, StillError> {
    if on_wayland() {
        return Err(StillError::Unavailable);
    }
    let (connection, screen) = x11rb::connect(None).map_err(|error| failed("connect", &error))?;
    let setup = connection.setup();
    let root = setup
        .roots
        .get(screen)
        .ok_or_else(|| StillError::Failed("no root window".to_owned()))?
        .root;
    let image = connection
        .get_image(
            ImageFormat::Z_PIXMAP,
            root,
            i16::try_from(area.left).map_err(|error| failed("left", &error))?,
            i16::try_from(area.top).map_err(|error| failed("top", &error))?,
            u16::try_from(area.width).map_err(|error| failed("width", &error))?,
            u16::try_from(area.height).map_err(|error| failed("height", &error))?,
            u32::MAX,
        )
        .map_err(|error| failed("GetImage", &error))?
        .reply()
        .map_err(|error| failed("GetImage", &error))?;
    // Only 32 bits a pixel, low byte first, is BGRX; anything else (a
    // 16-bit screen) is refused rather than shown wrong.
    let four_bytes = setup
        .pixmap_formats
        .iter()
        .any(|format| format.depth == image.depth && format.bits_per_pixel == 32);
    if !four_bytes || setup.image_byte_order != ImageOrder::LSB_FIRST {
        return Err(StillError::Unavailable);
    }
    still_from_bgra_rows(
        &image.data,
        area.width,
        area.height,
        area.width as usize * 4,
    )
    .ok_or_else(|| StillError::Failed("GetImage: too few bytes".to_owned()))
}

/// Whether this session is Wayland's, by the variables the session sets.
fn on_wayland() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some()
        || std::env::var("XDG_SESSION_TYPE").is_ok_and(|kind| kind == "wayland")
}

fn failed(call: &str, error: &dyn std::fmt::Display) -> StillError {
    StillError::Failed(format!("{call}: {error}"))
}
