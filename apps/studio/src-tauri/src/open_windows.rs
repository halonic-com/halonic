//! The app windows open at the last quit (HAL-19534, board request): which
//! of Studio's, the Inbox's and the Messenger's windows showed, which had
//! the focus, and what each showed, as its page put it. The next start
//! opens them all again, each in its own place (`window_place.rs`), unless
//! Settings › Startup's "Reopen windows on start" is off. The list lives in
//! the CLI's profile, `studio/open-windows.json`, next to the workspaces
//! open at the last Quit (`last_quit.rs`); only the shell reads and writes
//! it.
//!
//! This file is the list's rules; `open_windows_track.rs` keeps it up to
//! date as windows come and go. Only the three app windows are ever listed,
//! so the feedback, brief and quick ask windows never come back. The list
//! fails closed: a file that is missing, can't be read, is too big or isn't
//! the format below is an empty list, so only the window a start asks for
//! opens.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::focused_apps::{STUDIO_WINDOW, window_labels};

/// The file's name, in the profile's `studio` folder.
pub const FILE_NAME: &str = "open-windows.json";

/// The host setting for Settings › Startup's "Reopen windows on start".
pub const SETTING: &str = "windows.reopenOnStart";

/// The most a window's content may be, in bytes. A page keeps ids and
/// paths there, which it checks again when it reads them back.
pub const MAX_CONTENT_BYTES: usize = 2048;

/// The file's format. A file with another version is read as an empty list.
const FORMAT_VERSION: u32 = 1;

/// The most of the file that is read: three windows with the most content
/// each, every byte of it a character JSON writes as `\uXXXX` (six bytes),
/// and room to spare.
const MAX_FILE_BYTES: u64 = 48 * 1024;

/// One app window that showed.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenWindow {
    /// Its window label: `main`, `inbox` or `messenger`.
    pub label: String,
    /// Whether it had the keyboard focus.
    pub focused: bool,
    /// What its page showed, as the page put it; never read by the shell.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ListFile {
    version: u32,
    windows: Vec<OpenWindow>,
}

/// Replaces the list in `file` with `windows`, only those `kept` keeps.
pub fn record(file: &Path, windows: &[OpenWindow]) -> std::io::Result<()> {
    let list = ListFile {
        version: FORMAT_VERSION,
        windows: kept(windows.to_vec()),
    };
    let mut text = serde_json::to_string_pretty(&list)?;
    text.push('\n');
    crate::last_quit::replace_file(file, &text)
}

/// The recorded windows, only those `kept` keeps, or none when the file is
/// missing or can't be trusted. Why it can't goes to the log.
pub fn read(file: &Path) -> Vec<OpenWindow> {
    let read = crate::last_quit::read_capped(file, MAX_FILE_BYTES).and_then(|text| {
        let Some(text) = text else {
            return Ok(Vec::new());
        };
        let list: ListFile = serde_json::from_str(&text).map_err(|error| error.to_string())?;
        if list.version != FORMAT_VERSION {
            return Err(format!(
                "it has version {}, not {FORMAT_VERSION}",
                list.version
            ));
        }
        Ok(list.windows)
    });
    match read {
        Ok(windows) => kept(windows),
        Err(problem) => {
            halonic_shell_log::record(
                "window",
                format_args!("the windows open at the last quit can't be read: {problem}"),
            );
            Vec::new()
        }
    }
}

/// `windows` with only the app windows, each once, and without a content
/// over [`MAX_CONTENT_BYTES`]: that window opens on its app's start screen.
pub fn kept(windows: Vec<OpenWindow>) -> Vec<OpenWindow> {
    let mut kept: Vec<OpenWindow> = Vec::new();
    for mut window in windows {
        let known = window_labels().contains(&window.label.as_str());
        if !known || kept.iter().any(|other| other.label == window.label) {
            continue;
        }
        if window
            .content
            .as_ref()
            .is_some_and(|content| content.len() > MAX_CONTENT_BYTES)
        {
            window.content = None;
        }
        kept.push(window);
    }
    kept
}

/// What the shell knows of the open windows while Halonic runs: the windows
/// open at the last quit, until they are opened again, the list last
/// written, each window's content, whether the recorded windows were opened
/// again, and whether Halonic is quitting.
#[derive(Debug, Default)]
pub struct OpenSet {
    recorded: Vec<OpenWindow>,
    last: Vec<OpenWindow>,
    contents: Vec<(String, String)>,
    reopened: bool,
    quitting: bool,
}

impl OpenSet {
    /// The set as the last quit left it: `recorded`, and each one's content.
    pub fn from_recorded(recorded: &[OpenWindow]) -> OpenSet {
        let contents = recorded
            .iter()
            .filter_map(|window| Some((window.label.clone(), window.content.clone()?)))
            .collect();
        OpenSet {
            recorded: recorded.to_vec(),
            last: recorded.to_vec(),
            contents,
            ..OpenSet::default()
        }
    }

    /// The windows to open with the first window a start opens: the ones
    /// open at the last quit, once per run, so a start at login reopens them
    /// with the first window the user opens, however it opens, and a later
    /// start only shows the window it asks for. Empty after the first call.
    pub fn first_open(&mut self) -> Vec<OpenWindow> {
        if std::mem::replace(&mut self.reopened, true) {
            return Vec::new();
        }
        std::mem::take(&mut self.recorded)
    }

    /// The list to write now that the windows `showing` show, by label and
    /// whether each has the focus, or `None` to keep the last one: when
    /// nothing changed, when no window shows, or once Halonic is quitting.
    /// When the focus is on no app window, as when the user clicks the tray
    /// or switches to another program, the app window that had it last
    /// keeps it. The last window closing leaves its own entry; every other
    /// close writes the shorter list.
    pub fn note(&mut self, showing: &[(&str, bool)]) -> Option<Vec<OpenWindow>> {
        if self.quitting {
            return None;
        }
        let mut windows = kept(
            showing
                .iter()
                .map(|(label, focused)| OpenWindow {
                    label: (*label).to_owned(),
                    focused: *focused,
                    content: self.content(label),
                })
                .collect(),
        );
        if !windows.iter().any(|window| window.focused) {
            let previous = self.last.iter().find(|window| window.focused);
            if let Some(window) = windows
                .iter_mut()
                .find(|window| previous.is_some_and(|previous| previous.label == window.label))
            {
                window.focused = true;
            }
        }
        if windows.is_empty() || windows == self.last {
            return None;
        }
        self.last = windows.clone();
        Some(windows)
    }

    /// Halonic starts quitting: notes the windows `showing` one last time,
    /// and then no more, since quitting closes every window.
    pub fn quit(&mut self, showing: &[(&str, bool)]) -> Option<Vec<OpenWindow>> {
        let written = self.note(showing);
        self.quitting = true;
        written
    }

    /// Keeps `content` for the window labelled `label`, or forgets it for
    /// `None`. Refused as `not_an_app_window` for any other window, and as
    /// `too_long` over [`MAX_CONTENT_BYTES`], so a page never reads back a
    /// string cut short.
    pub fn set_content(
        &mut self,
        label: &str,
        content: Option<String>,
    ) -> Result<(), &'static str> {
        if !window_labels().contains(&label) {
            return Err("not_an_app_window");
        }
        if content
            .as_ref()
            .is_some_and(|content| content.len() > MAX_CONTENT_BYTES)
        {
            return Err("too_long");
        }
        self.contents.retain(|(kept, _)| kept != label);
        if let Some(content) = content {
            self.contents.push((label.to_owned(), content));
        }
        Ok(())
    }

    /// The content kept for the window labelled `label`.
    pub fn content(&self, label: &str) -> Option<String> {
        self.contents
            .iter()
            .find(|(kept, _)| kept == label)
            .map(|(_, content)| content.clone())
    }
}

/// Whether the setting `saved` says to reopen the windows: on unless it is
/// saved as `false`, so a profile that never saw the switch reopens them.
pub fn reopens(saved: Option<&Value>) -> bool {
    saved != Some(&Value::Bool(false))
}

/// The labels to open, in order: every recorded window, then the one
/// `asked` for (Studio's for `None`), so it ends up in front, or, when the
/// start asked for none in particular, the one that had the focus.
pub fn opening_order(recorded: &[OpenWindow], asked: Option<&str>) -> Vec<String> {
    let front = asked.map(str::to_owned).unwrap_or_else(|| {
        recorded
            .iter()
            .find(|window| window.focused)
            .or(recorded.first())
            .map_or_else(|| STUDIO_WINDOW.to_owned(), |window| window.label.clone())
    });
    let mut order: Vec<String> = recorded
        .iter()
        .map(|window| window.label.clone())
        .filter(|label| *label != front)
        .collect();
    order.push(front);
    order
}

#[cfg(test)]
#[path = "open_windows_tests.rs"]
mod tests;
