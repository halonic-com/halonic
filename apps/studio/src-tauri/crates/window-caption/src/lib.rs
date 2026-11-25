//! Colours one window's title bar like the Studio's frame (HAL-18698). Every
//! Studio window keeps the native Windows title bar, and Tauri can't colour
//! it on Windows, so the shell asks Windows itself. The title text takes
//! slate-900 on a light bar and slate-50 on a dark one: Windows picks it
//! from the window's dark-mode setting, not from the bar's colour, so a
//! dark bar on a light system would otherwise get black text.
//!
//! Reading the colour and choosing the text are plain functions that build
//! and test anywhere; only the call is Windows only.

#[cfg(windows)]
mod platform;

/// A colour, one byte per channel.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rgb {
    pub red: u8,
    pub green: u8,
    pub blue: u8,
}

/// The title text on a light bar: slate-900.
pub const DARK_TEXT: Rgb = Rgb {
    red: 0x0f,
    green: 0x17,
    blue: 0x2a,
};

/// The title text on a dark bar: slate-50.
pub const LIGHT_TEXT: Rgb = Rgb {
    red: 0xf8,
    green: 0xfa,
    blue: 0xfc,
};

/// The colour `text` names as `#rrggbb`, either case, or `None` for
/// anything else: no shorthand, no name, no spaces.
pub fn parse_hex(text: &str) -> Option<Rgb> {
    let digits = text.strip_prefix('#')?;
    if digits.len() != 6 || !digits.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let channel = |start: usize| u8::from_str_radix(&digits[start..start + 2], 16).ok();
    Some(Rgb {
        red: channel(0)?,
        green: channel(2)?,
        blue: channel(4)?,
    })
}

/// `colour` as Windows' COLORREF: `0x00BBGGRR`, red in the lowest byte.
pub fn colorref(colour: Rgb) -> u32 {
    u32::from(colour.red) | (u32::from(colour.green) << 8) | (u32::from(colour.blue) << 16)
}

/// The title text on a bar of `caption`: whichever of [`DARK_TEXT`] and
/// [`LIGHT_TEXT`] has the more contrast with it (WCAG's contrast ratio).
pub fn text_colour(caption: Rgb) -> Rgb {
    let bar = luminance(caption);
    if contrast(bar, luminance(DARK_TEXT)) >= contrast(bar, luminance(LIGHT_TEXT)) {
        DARK_TEXT
    } else {
        LIGHT_TEXT
    }
}

/// WCAG's relative luminance of `colour`, 0 for black to 1 for white.
fn luminance(colour: Rgb) -> f64 {
    let linear = |channel: u8| {
        let value = f64::from(channel) / 255.0;
        if value <= 0.04045 {
            value / 12.92
        } else {
            ((value + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * linear(colour.red) + 0.7152 * linear(colour.green) + 0.0722 * linear(colour.blue)
}

/// WCAG's contrast ratio of two luminances, from 1 to 21.
fn contrast(first: f64, second: f64) -> f64 {
    (first.max(second) + 0.05) / (first.min(second) + 0.05)
}

/// Colours the title bar of the window `window` (its `HWND`) `caption`, and
/// its title text to read on it. An error says what Windows answered, such
/// as Windows 10, which has no caption colour; the bar then stays the
/// system's.
#[cfg(windows)]
pub fn set(window: *mut core::ffi::c_void, caption: Rgb) -> Result<(), String> {
    platform::set(window, caption)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SLATE_75: Rgb = Rgb {
        red: 0xf4,
        green: 0xf7,
        blue: 0xfa,
    };
    const SLATE_950: Rgb = Rgb {
        red: 0x02,
        green: 0x06,
        blue: 0x17,
    };

    #[test]
    fn parse_hex_reads_six_digits_after_a_hash() {
        assert_eq!(parse_hex("#f4f7fa"), Some(SLATE_75));
        assert_eq!(parse_hex("#F4F7FA"), Some(SLATE_75));
        assert_eq!(parse_hex("#020617"), Some(SLATE_950));
    }

    #[test]
    fn parse_hex_refuses_anything_else() {
        for text in [
            "",
            "#",
            "f4f7fa",
            "#fff",
            "#f4f7fa00",
            "#f4f7f",
            "#g4f7fa",
            " #f4f7fa",
            "#f4f7fa ",
            "rgb(1 2 3)",
            "white",
            "#+4f7fa",
            "#é4f7f",
        ] {
            assert_eq!(parse_hex(text), None, "{text:?}");
        }
    }

    #[test]
    fn colorref_puts_red_in_the_lowest_byte() {
        let colour = Rgb {
            red: 0x12,
            green: 0x34,
            blue: 0x56,
        };
        assert_eq!(colorref(colour), 0x0056_3412);
        assert_eq!(colorref(SLATE_75), 0x00fa_f7f4);
    }

    #[test]
    fn text_is_dark_on_a_light_bar_and_light_on_a_dark_one() {
        assert_eq!(text_colour(SLATE_75), DARK_TEXT);
        assert_eq!(text_colour(SLATE_950), LIGHT_TEXT);
        // The main window's halo start, light and dark (blue-and-purple).
        assert_eq!(parse_hex("#b6cff9").map(text_colour), Some(DARK_TEXT));
        assert_eq!(parse_hex("#0b1a3a").map(text_colour), Some(LIGHT_TEXT));
    }

    #[test]
    fn text_on_a_mid_grey_is_whichever_reads_better() {
        // White and slate-900 read the same at about luminance 0.18.
        let grey = |level: u8| Rgb {
            red: level,
            green: level,
            blue: level,
        };
        assert_eq!(text_colour(grey(0x70)), LIGHT_TEXT);
        assert_eq!(text_colour(grey(0x80)), DARK_TEXT);
    }
}
