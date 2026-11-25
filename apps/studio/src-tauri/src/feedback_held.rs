//! What the feedback shortcut holds between a press and the send
//! (HAL-18778): the stills of one press, by screen number, until two
//! minutes pass or a box is selected, and then only the crop of that box.
//! Plain values and functions, so they test without windows or a screen.

// Until the overlay's page lands, nothing registers the saved shortcut
// at start (HAL-18778 PR 4), so outside the tests its parsing is unused.
#![cfg_attr(
    not(test),
    expect(dead_code, reason = "used once PR 4 registers the shortcut")
)]

use std::str::FromStr;
use std::time::{Duration, Instant};

use halonic_screen_still::{CropBox, Still};
use serde::Deserialize;
use serde_json::Value;
use tauri_plugin_global_shortcut::Shortcut;

/// Ctrl+Alt+F, or ⌘⌥F on macOS. Not Ctrl+Shift+F: that is "Find in files"
/// in VS Code and JetBrains, and a global shortcut would take it from them.
pub const DEFAULT_SHORTCUT: &str = "CommandOrControl+Alt+F";

/// The overlay windows' labels: this and the screen's number.
pub const OVERLAY_PREFIX: &str = "feedback-overlay-";

/// The most screens one press captures. No capability may name a window
/// with a wildcard (`served_page_tests`), so the overlay's capability lists
/// each of these labels by name.
pub const MAX_SCREENS: usize = 8;

/// How long the stills wait for a selection before they are dropped.
pub const STILL_LIFETIME: Duration = Duration::from_secs(120);

/// The stills of one press, by screen number, or the crop made from them.
#[derive(Default)]
pub struct Held {
    stills: Vec<Still>,
    taken: Option<Instant>,
    crop: Option<Still>,
    /// Counts the presses, so a timer set for one never drops a later one.
    press: u64,
}

impl Held {
    /// Holds the stills of a new press, dropping anything held before, and
    /// gives the press's number for `expire`.
    pub fn hold(&mut self, stills: Vec<Still>, now: Instant) -> u64 {
        *self = Held {
            stills,
            taken: Some(now),
            crop: None,
            press: self.press + 1,
        };
        self.press
    }

    /// Drops the stills of press `press` when no box was selected from them
    /// yet: its STILL_LIFETIME is over. A later press is left alone.
    /// Says whether it dropped them.
    pub fn expire(&mut self, press: u64) -> bool {
        let expired = self.press == press && !self.stills.is_empty();
        if expired {
            self.stills.clear();
        }
        expired
    }

    /// Drops the stills and keeps the crop: an overlay closed some other
    /// way, such as Alt+F4.
    pub fn drop_stills(&mut self) {
        self.stills.clear();
    }

    /// Drops everything: the feedback ended. Later presses keep counting.
    pub fn clear(&mut self) {
        let press = self.press;
        *self = Held {
            press,
            ..Held::default()
        };
    }

    /// Screen `index`'s still, while it is younger than STILL_LIFETIME.
    /// An older one is dropped.
    pub fn still(&mut self, index: usize, now: Instant) -> Option<&Still> {
        let fresh = self
            .taken
            .is_some_and(|taken| now.duration_since(taken) < STILL_LIFETIME);
        if !fresh {
            self.stills.clear();
        }
        self.stills.get(index)
    }

    /// Keeps the crop of screen `index`'s still and drops every still;
    /// `false`, keeping nothing, when the box isn't inside that still.
    pub fn select(&mut self, index: usize, crop: CropBox, now: Instant) -> bool {
        let cropped = self.still(index, now).and_then(|still| still.crop(crop));
        let selected = cropped.is_some();
        self.stills.clear();
        self.crop = cropped;
        selected
    }

    /// The selected crop, until the feedback ends.
    pub fn crop(&self) -> Option<&Still> {
        self.crop.as_ref()
    }
}

/// The box an overlay's page selected, in its still's pixels. Negative or
/// fractional numbers aren't a box: they are refused before the command.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
pub struct SelectedBox {
    pub left: u32,
    pub top: u32,
    pub width: u32,
    pub height: u32,
}

impl From<SelectedBox> for CropBox {
    fn from(area: SelectedBox) -> Self {
        CropBox {
            left: area.left,
            top: area.top,
            width: area.width,
            height: area.height,
        }
    }
}

/// The shortcut the saved `value` names, or the default when nothing is
/// saved or the value isn't a shortcut.
pub fn saved_shortcut(value: Option<&Value>) -> Shortcut {
    value
        .and_then(Value::as_str)
        .and_then(|text| Shortcut::from_str(text).ok())
        .unwrap_or_else(|| Shortcut::from_str(DEFAULT_SHORTCUT).expect("the default parses"))
}

/// The screen number of an overlay window's label, below `MAX_SCREENS`.
pub fn overlay_index(label: &str) -> Option<usize> {
    let index: usize = label.strip_prefix(OVERLAY_PREFIX)?.parse().ok()?;
    (index < MAX_SCREENS).then_some(index)
}

/// A still as the page reads it: width and height as two little-endian
/// u32s, then the RGBA rows.
pub fn still_bytes(still: &Still) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(8 + still.rgba.len());
    bytes.extend_from_slice(&still.width.to_le_bytes());
    bytes.extend_from_slice(&still.height.to_le_bytes());
    bytes.extend_from_slice(&still.rgba);
    bytes
}
