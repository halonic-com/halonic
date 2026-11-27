//! The sign-in window (HAL-20515): a sign-in page opens as a small app
//! window of the user's own Chromium browser (Chrome, Edge or Brave),
//! centred on the Halonic window that asked for it. It is the user's own
//! browser profile, so saved passwords, passkeys and existing logins work,
//! and the page shows in front of the person instead of in a browser window
//! elsewhere on a wide screen. With any other default browser [`launch`]
//! starts nothing, and the page opens as every other link does.
//!
//! A browser that is already running may ignore the size and place on its
//! command line, so [`Launch::place`] then finds the one window that wasn't
//! there before and moves it. Windows only for now: elsewhere [`launch`]
//! always answers that it started nothing.
//!
//! Everything but the Windows calls is plain logic in `rules`, tested on
//! every platform.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

pub use url::Url;

mod rules;

pub use rules::{
    Browser, MIN_HEIGHT, MIN_WIDTH, NewWindows, browser_exe, chromium_browser, launch_arguments,
    new_windows, popup_rect, sign_in_url,
};

#[cfg(windows)]
mod platform;

/// A rectangle on the screen, in physical pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// A window, by its handle as a number, so it can cross threads.
pub type Handle = isize;

/// One top-level window of the browser.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BrowserWindow {
    pub handle: Handle,
    pub visible: bool,
}

/// How long [`Launch::place`] looks for the new window.
pub const PLACE_WITHIN: Duration = Duration::from_secs(3);

/// How often it looks.
const LOOK_EVERY: Duration = Duration::from_millis(50);

/// A sign-in window the browser was asked to open.
#[derive(Debug)]
pub struct Launch {
    exe: PathBuf,
    before: Vec<Handle>,
    rect: Rect,
}

/// What [`Launch::place`] did, for the shell's log.
#[derive(Debug, PartialEq, Eq)]
pub enum Placed {
    /// The one new window was moved to the sign-in's place.
    Moved,
    /// No new window showed in time, so nothing was moved.
    NoneNew,
    /// Several new windows showed, so nothing was moved rather than guess.
    Several(usize),
    /// Listing or moving the windows failed.
    Failed(String),
}

impl std::fmt::Display for Placed {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Placed::Moved => write!(formatter, "the sign-in window was moved over Halonic"),
            Placed::NoneNew => write!(
                formatter,
                "no new browser window showed within {}s, so none was moved",
                PLACE_WITHIN.as_secs()
            ),
            Placed::Several(count) => write!(
                formatter,
                "{count} new browser windows showed, so none was moved"
            ),
            Placed::Failed(error) => write!(formatter, "placing the sign-in window: {error}"),
        }
    }
}

/// Opens `url` as an app window of the default browser at `rect`, when
/// that browser is Chromium. `Ok(None)` when it isn't, or isn't found, so
/// the caller opens the page as before; `Err` when reading the setting or
/// starting the browser failed, which the caller logs before doing the same.
pub fn launch(url: &Url, rect: Rect) -> Result<Option<Launch>, String> {
    let Some(prog_id) = platform::https_prog_id()? else {
        return Ok(None);
    };
    if chromium_browser(&prog_id).is_none() {
        return Ok(None);
    }
    let Some(command) = platform::open_command(&prog_id)? else {
        return Ok(None);
    };
    let Some(exe) = browser_exe(&command, Path::is_file) else {
        return Ok(None);
    };
    let before = platform::browser_windows(&exe)?
        .into_iter()
        .map(|window| window.handle)
        .collect();
    start(&exe, url, rect)?;
    Ok(Some(Launch { exe, before, rect }))
}

#[allow(
    clippy::zombie_processes,
    reason = "Windows has no zombie processes: dropping the child closes its handle, and the browser lives on"
)]
fn start(exe: &Path, url: &Url, rect: Rect) -> Result<(), String> {
    Command::new(exe)
        .args(launch_arguments(url, rect))
        .spawn()
        .map(drop)
        .map_err(|error| format!("starting {}: {error}", exe.display()))
}

impl Launch {
    /// Looks for the browser's new window for up to [`PLACE_WITHIN`] and
    /// moves it to the sign-in's place. It waits, so the caller runs it off
    /// the main thread.
    pub fn place(&self) -> Placed {
        let deadline = Instant::now() + PLACE_WITHIN;
        place_new_window(
            &self.before,
            || platform::browser_windows(&self.exe),
            |handle| platform::move_window(handle, self.rect),
            || {
                if Instant::now() >= deadline {
                    return false;
                }
                std::thread::sleep(LOOK_EVERY);
                true
            },
        )
    }
}

/// The search behind [`Launch::place`]: lists the windows, moves the one
/// that is new, and otherwise asks `wait` whether to look again.
pub fn place_new_window(
    before: &[Handle],
    mut list: impl FnMut() -> Result<Vec<BrowserWindow>, String>,
    mut move_to: impl FnMut(Handle) -> Result<(), String>,
    mut wait: impl FnMut() -> bool,
) -> Placed {
    loop {
        let now = match list() {
            Ok(now) => now,
            Err(error) => return Placed::Failed(error),
        };
        match new_windows(before, &now) {
            NewWindows::One(handle) => {
                return match move_to(handle) {
                    Ok(()) => Placed::Moved,
                    Err(error) => Placed::Failed(error),
                };
            }
            NewWindows::Several(count) => return Placed::Several(count),
            NewWindows::None => {}
        }
        if !wait() {
            return Placed::NoneNew;
        }
    }
}

/// Elsewhere there is no default-browser setting to read yet, so nothing
/// starts and every page opens as before.
#[cfg(not(windows))]
mod platform {
    use std::path::Path;

    use crate::{BrowserWindow, Handle, Rect};

    pub fn https_prog_id() -> Result<Option<String>, String> {
        Ok(None)
    }

    pub fn open_command(_prog_id: &str) -> Result<Option<String>, String> {
        Ok(None)
    }

    pub fn browser_windows(_exe: &Path) -> Result<Vec<BrowserWindow>, String> {
        Ok(Vec::new())
    }

    pub fn move_window(_handle: Handle, _rect: Rect) -> Result<(), String> {
        Err("windows can't be moved on this system".to_owned())
    }
}
