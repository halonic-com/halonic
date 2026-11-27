//! The frames of Halonic Inbox and Halonic Messenger on Windows (HAL-20468).
//!
//! Window managers such as PowerToys FancyZones keep one place per exe:
//! they key a window on the path of the process that owns it. Inbox and
//! Messenger are windows of Halonic.exe, which holds the engine, the
//! connection and every command their page calls, so they shared Studio's
//! place. Each now has a small exe of its own, its *frame*: it owns the
//! app's top-level window (title, icon, taskbar ID, snapping) and asks the
//! running Halonic, through its usual `--app` start, to draw the app's page
//! inside it (`--host-window`). Halonic makes its window a child of the
//! frame, so the page still runs in Halonic, and window managers see the
//! frame's exe.
//!
//! This file is plain Rust, so it is tested on every platform: the frames,
//! their exes' names, and the arguments. The Windows calls are in
//! `platform` (what Halonic does with a frame's window) and `frame` (the
//! frame's own process).

use std::path::{Path, PathBuf};

#[cfg(windows)]
mod frame;
#[cfg(windows)]
mod placement;
#[cfg(windows)]
mod platform;

#[cfg(windows)]
pub use frame::run;
#[cfg(windows)]
pub use platform::{
    bring_forward, client_size, close, colour_caption, process_image, root, same_file, set_text,
    start_frame,
};

/// The argument with which a frame hands Halonic its window, as a decimal
/// `HWND`: `--host-window 1234` or `--host-window=1234`.
pub const HOST_WINDOW_ARGUMENT: &str = "--host-window";

/// The message with which Halonic asks a frame to colour its title bar,
/// `WM_APP + 1`, with the colour as a `COLORREF` in its `wparam`. Windows
/// lets a process colour only its own windows' title bars, so the frame
/// does it.
pub const CAPTION_MESSAGE: u32 = 0x8000 + 1;

/// The app's identifier (tauri.conf.json), the start of each frame's
/// AppUserModelID. The shell's tests check that the two match.
pub const IDENTIFIER: &str = "com.halonic.studio";

/// The names Halonic's exe may have next to a frame: the installed one
/// (`mainBinaryName`), then the one Cargo builds.
const MAIN_EXES: [&str; 2] = ["Halonic.exe", "halonic-studio.exe"];

/// An app with a frame of its own.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FrameApp {
    Inbox,
    Messenger,
}

impl FrameApp {
    /// Every app with a frame.
    pub const ALL: [FrameApp; 2] = [FrameApp::Inbox, FrameApp::Messenger];

    /// Its name after `--app`, which is also its window's label in Halonic.
    pub fn name(self) -> &'static str {
        match self {
            FrameApp::Inbox => "inbox",
            FrameApp::Messenger => "messenger",
        }
    }

    /// The frame's title until Halonic's page sets one, as its shortcut is
    /// named.
    pub fn title(self) -> &'static str {
        match self {
            FrameApp::Inbox => "Halonic Inbox",
            FrameApp::Messenger => "Halonic Messenger",
        }
    }

    /// The names its frame's exe may have: the installed one, then one a
    /// developer links next to the Cargo build (`target/<profile>/`).
    pub fn exe_names(self) -> [&'static str; 2] {
        match self {
            FrameApp::Inbox => ["Halonic Inbox.exe", "halonic-inbox.exe"],
            FrameApp::Messenger => ["Halonic Messenger.exe", "halonic-messenger.exe"],
        }
    }

    /// Its AppUserModelID, the one its Start menu shortcut carries.
    pub fn app_user_model_id(self) -> String {
        format!("{IDENTIFIER}.{}", self.name())
    }

    /// The .ico its frame takes its icons from, as its shortcut does.
    pub fn ico(self) -> &'static [u8] {
        match self {
            FrameApp::Inbox => include_bytes!("../../../icons/apps/inbox.ico"),
            FrameApp::Messenger => include_bytes!("../../../icons/apps/messenger.ico"),
        }
    }

    /// The app named `name`, as after `--app`.
    pub fn named(name: &str) -> Option<FrameApp> {
        FrameApp::ALL.into_iter().find(|app| app.name() == name)
    }
}

/// The app whose frame `exe` is, by its file name, or `None` for Halonic
/// itself. The frames are hard links to Halonic's exe that the installer
/// makes, so one exe is built and signed, and its name says what to run.
/// Windows names don't tell case apart, so neither does this. The path is
/// read as a Windows path on every platform, so the tests run anywhere.
pub fn started_as(exe: &Path) -> Option<FrameApp> {
    let path = windows_path(exe);
    let name = path.rsplit('\\').next()?;
    FrameApp::ALL.into_iter().find(|app| {
        app.exe_names()
            .iter()
            .any(|expected| expected.to_lowercase() == name)
    })
}

/// The frame window a start's `arguments` hand over, or `None` when they
/// name none, or name `0` or something that isn't a number.
pub fn host_window<S: AsRef<str>>(arguments: &[S]) -> Option<isize> {
    let mut arguments = arguments.iter().map(AsRef::as_ref);
    while let Some(argument) = arguments.next() {
        let value = if argument == HOST_WINDOW_ARGUMENT {
            arguments.next()
        } else {
            argument
                .strip_prefix(HOST_WINDOW_ARGUMENT)
                .and_then(|rest| rest.strip_prefix('='))
        };
        if let Some(value) = value {
            return value.parse::<isize>().ok().filter(|&handle| handle != 0);
        }
    }
    None
}

/// The arguments a frame starts Halonic with for `app` in its window
/// `handle`.
pub fn host_arguments(app: FrameApp, handle: isize) -> [String; 4] {
    [
        "--app".to_owned(),
        app.name().to_owned(),
        HOST_WINDOW_ARGUMENT.to_owned(),
        handle.to_string(),
    ]
}

/// `app`'s frame exe in `folder` (Halonic's own), or `None` when there is
/// none, as in a build that doesn't ship the frames.
pub fn frame_exe(folder: &Path, app: FrameApp) -> Option<PathBuf> {
    first_file(folder, &app.exe_names())
}

/// Halonic's exe in `folder` (a frame's own), or `None` when there is none.
pub fn main_exe(folder: &Path) -> Option<PathBuf> {
    first_file(folder, &MAIN_EXES)
}

fn first_file(folder: &Path, names: &[&str]) -> Option<PathBuf> {
    names
        .iter()
        .map(|name| folder.join(name))
        .find(|path| path.is_file())
}

/// Whether `image`, the exe of the process that owns a window handed over
/// with `--host-window`, is `app`'s frame in `folder`, Halonic's own
/// folder. Halonic puts a page only into its own frames: never into
/// another program's window, nor into the other app's frame. It needs
/// both the frame's name and, by `same_file`, the very file of `app`'s
/// frame in `folder`. The file is compared by its identity rather than by
/// its path, since one file has many paths (an 8.3 short name, a `subst`
/// drive, a junction), and a hard link to Halonic's exe or a copy of it
/// each have their own.
pub fn is_frame_exe(
    image: &Path,
    folder: &Path,
    app: FrameApp,
    same_file: impl Fn(&Path, &Path) -> bool,
) -> bool {
    started_as(image) == Some(app)
        && app
            .exe_names()
            .iter()
            .any(|name| same_file(image, &folder.join(name)))
}

/// `path` with `\` between its parts, in lower case.
fn windows_path(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\").to_lowercase()
}

/// Where a frame was when it closed, kept per app so it opens there again
/// (`studio.src-tauri.window-place`): its restored rectangle in the
/// screen's work-area pixels, and whether it was maximised.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Placement {
    pub maximized: bool,
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

/// How many bytes a kept place takes.
pub const PLACEMENT_BYTES: usize = 20;

impl Placement {
    /// The place as kept: whether maximised, then the four edges, each four
    /// bytes, little-endian.
    pub fn to_bytes(self) -> [u8; PLACEMENT_BYTES] {
        let mut bytes = [0u8; PLACEMENT_BYTES];
        let fields = [
            i32::from(self.maximized),
            self.left,
            self.top,
            self.right,
            self.bottom,
        ];
        for (chunk, field) in bytes.as_chunks_mut::<4>().0.iter_mut().zip(fields) {
            chunk.copy_from_slice(&field.to_le_bytes());
        }
        bytes
    }

    /// The place kept as `bytes`, or `None` for anything `to_bytes` didn't
    /// write or a rectangle with no area, which then opens where Windows
    /// puts a new window.
    pub fn from_bytes(bytes: &[u8]) -> Option<Placement> {
        if bytes.len() != PLACEMENT_BYTES {
            return None;
        }
        let field = |index: usize| {
            let mut four = [0u8; 4];
            four.copy_from_slice(&bytes[index * 4..index * 4 + 4]);
            i32::from_le_bytes(four)
        };
        let placement = Placement {
            maximized: match field(0) {
                0 => false,
                1 => true,
                _ => return None,
            },
            left: field(1),
            top: field(2),
            right: field(3),
            bottom: field(4),
        };
        (placement.right > placement.left && placement.bottom > placement.top).then_some(placement)
    }
}

#[cfg(test)]
mod tests;
