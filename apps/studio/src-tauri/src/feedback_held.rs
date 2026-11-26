//! What the feedback shortcut holds between a press and the send
//! (HAL-18778): the still of the window the shortcut was pressed in, until
//! two minutes pass or a box is selected, and then only the crop of that box.
//! Plain values and functions, so they test without windows or a screen.

use std::str::FromStr;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use halonic_screen_still::{CropBox, Still};
use serde::Deserialize;
use tauri_plugin_global_shortcut::{Modifiers, Shortcut};

/// The label of the window that says screen capture isn't available on
/// this system yet, such as macOS or Linux on Wayland.
pub const UNAVAILABLE_WINDOW: &str = "feedback-unavailable";

/// How long the still waits for a selection before it is dropped. The
/// page's overlay closes itself after as long (`stillLifetime` in
/// `in-app-feedback.tsx`).
pub const STILL_LIFETIME: Duration = Duration::from_secs(120);

/// The still of one press, the window it was taken of, or the crop made
/// from it.
#[derive(Default)]
pub struct Held {
    still: Option<Still>,
    /// The label of the window whose press took the still: only that window
    /// may select from it.
    window: Option<String>,
    taken: Option<Instant>,
    crop: Option<Still>,
    /// Counts the presses, so a timer set for one never drops a later one.
    press: u64,
    /// A press's still is being taken: another press now would start a
    /// second capture.
    capturing: bool,
    /// The Send feedback window was asked to close and hasn't gone yet: a
    /// press now takes a new capture instead of bringing it forward.
    send_feedback_closing: bool,
}

/// Which of the feedback's windows are open when the shortcut is pressed.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct OpenWindows {
    pub send_feedback: bool,
}

/// What a press of the shortcut does.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Press {
    /// Nothing: the last press is still taking its still.
    Ignore,
    /// Brings the Send feedback window forward, keeping what is typed in it.
    ShowSendFeedback,
    /// Takes the still of the window the shortcut was pressed in;
    /// `capture_done` follows.
    Capture,
}

impl Held {
    /// Holds the still a new press took of `window`, dropping anything held
    /// before, and gives the press's number for `expire`.
    pub fn hold(&mut self, still: Still, window: &str, now: Instant) -> u64 {
        *self = Held {
            still: Some(still),
            window: Some(window.to_owned()),
            taken: Some(now),
            crop: None,
            press: self.press + 1,
            capturing: self.capturing,
            send_feedback_closing: self.send_feedback_closing,
        };
        self.press
    }

    /// The number of the last press, which its windows keep so that
    /// closing late never drops what a later press holds.
    pub fn press(&self) -> u64 {
        self.press
    }

    /// What a press of the shortcut does while `open` windows are open.
    /// A capture marks the still as being taken until `capture_done`, so
    /// a press in between is ignored instead of starting a second one.
    pub fn on_press(&mut self, open: OpenWindows) -> Press {
        if self.capturing {
            return Press::Ignore;
        }
        if open.send_feedback && !self.send_feedback_closing {
            return Press::ShowSendFeedback;
        }
        self.capturing = true;
        Press::Capture
    }

    /// The press's capture ended, with a still held or not.
    pub fn capture_done(&mut self) {
        self.capturing = false;
    }

    /// The Send feedback window was asked to close.
    pub fn send_feedback_closing(&mut self) {
        self.send_feedback_closing = true;
    }

    /// The Send feedback window is gone.
    pub fn send_feedback_closed(&mut self) {
        self.send_feedback_closing = false;
    }

    /// Drops the still of press `press` when no box was selected from it
    /// yet: its STILL_LIFETIME is over. A later press is left alone.
    /// Says whether it dropped it.
    pub fn expire(&mut self, press: u64) -> bool {
        let expired = self.press == press && self.still.is_some();
        if expired {
            self.still = None;
        }
        expired
    }

    /// Drops everything: the feedback ended. Later presses keep counting,
    /// and a capture under way is still under way.
    pub fn clear(&mut self) {
        *self = Held {
            press: self.press,
            capturing: self.capturing,
            send_feedback_closing: self.send_feedback_closing,
            ..Held::default()
        };
    }

    /// Drops everything held for press `press`: its Send feedback window
    /// closed. A later press's still is left alone.
    pub fn clear_press(&mut self, press: u64) {
        if self.press == press {
            self.clear();
        }
    }

    /// The still, while it is younger than STILL_LIFETIME. An older one is
    /// dropped.
    pub fn still(&mut self, now: Instant) -> Option<&Still> {
        let fresh = self
            .taken
            .is_some_and(|taken| now.duration_since(taken) < STILL_LIFETIME);
        if !fresh {
            self.still = None;
        }
        self.still.as_ref()
    }

    /// Keeps the crop of the still and drops the still, when `window` is the
    /// one whose press took it. Refused as `other_window`, leaving what is
    /// held alone, when another window's press took it, and as `gone`,
    /// keeping nothing, when no still is held or the box isn't inside it.
    pub fn select(
        &mut self,
        window: &str,
        crop: CropBox,
        now: Instant,
    ) -> Result<(), &'static str> {
        if self.window.as_deref().is_some_and(|held| held != window) {
            return Err("other_window");
        }
        let cropped = self.still(now).and_then(|still| still.crop(crop));
        self.still = None;
        self.crop = cropped;
        if self.crop.is_none() {
            return Err("gone");
        }
        Ok(())
    }

    /// The selected crop, until the feedback ends.
    pub fn crop(&self) -> Option<&Still> {
        self.crop.as_ref()
    }
}

/// Marks a press's capture as ended when it is dropped, so a capture that
/// panics still lets the next press take one.
pub struct Capturing<'a>(pub &'a Mutex<Held>);

impl Drop for Capturing<'_> {
    fn drop(&mut self) {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .capture_done();
    }
}

/// The box the window's overlay selected, in its still's pixels. Negative or
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

/// The shortcut `text` names, when it holds Ctrl, Alt or Super (⌘). Shift
/// alone isn't enough: Shift+F would take every capital F typed in Studio.
pub fn shortcut_of(text: &str) -> Option<Shortcut> {
    let shortcut = Shortcut::from_str(text).ok()?;
    let holding = Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER;
    shortcut.mods.intersects(holding).then_some(shortcut)
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
