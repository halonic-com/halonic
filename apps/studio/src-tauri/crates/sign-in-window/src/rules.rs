//! The plain logic, tested on every platform: which default browsers are
//! Chromium, where the browser is, which addresses may open, where the
//! window goes, its command line, and which window is the new one.

use std::net::IpAddr;
use std::path::{Path, PathBuf};

use url::{Host, Url};

use crate::{BrowserWindow, Handle, Rect};

/// The Chromium browsers whose app window the shell opens.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Browser {
    Chrome,
    Edge,
    Brave,
}

/// Each browser's ProgId for `https`, as Windows' default-app setting
/// names it.
const CHROMIUM_PROG_IDS: [(&str, Browser); 3] = [
    ("ChromeHTML", Browser::Chrome),
    ("MSEdgeHTM", Browser::Edge),
    ("BraveHTML", Browser::Brave),
];

/// The share of the triggering window the sign-in window takes, in fifths.
const SHARE_IN_FIFTHS: u64 = 4;

/// The smallest sign-in window: room for a sign-in form and its buttons.
pub const MIN_WIDTH: u32 = 480;
pub const MIN_HEIGHT: u32 = 560;

/// The Chromium browser a `https` ProgId names, or `None` for any other
/// browser. A per-user install can add `.` and a letters-and-digits suffix,
/// as `ChromeHTML.ABC123` beside a second Chrome; nothing else matches, so
/// the registry key the shell then reads is always one of these names.
pub fn chromium_browser(prog_id: &str) -> Option<Browser> {
    CHROMIUM_PROG_IDS.iter().find_map(|&(name, browser)| {
        let rest = prog_id.strip_prefix(name)?;
        let suffix_ok = rest.is_empty()
            || rest.strip_prefix('.').is_some_and(|suffix| {
                !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_alphanumeric())
            });
        suffix_ok.then_some(browser)
    })
}

/// The browser's program in its `shell\open\command`, such as
/// `"<Chrome's folder>\chrome.exe" --single-argument %1`:
/// the quoted first part, or the first word when it isn't quoted. It must
/// be an absolute Windows path to an `.exe` that `exists` finds; anything
/// else is `None`, and the link opens as before.
pub fn browser_exe(command: &str, exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    let command = command.trim_start();
    let program = match command.strip_prefix('"') {
        Some(quoted) => quoted.split_once('"')?.0,
        None => command.split_whitespace().next()?,
    };
    let is_exe = program
        .rsplit_once('.')
        .is_some_and(|(_, extension)| extension.eq_ignore_ascii_case("exe"));
    let path = Path::new(program);
    (is_exe && is_drive_path(program) && exists(path)).then(|| path.to_owned())
}

/// Whether `text` starts with a drive, as `C:\`. A network path (`\\host`)
/// or a relative one isn't a browser the shell starts.
fn is_drive_path(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() > 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}

/// The address a sign-in may open: an absolute `https` address, or plain
/// `http` to this computer, with no user name or password in it. Anything
/// else is `None`.
pub fn sign_in_url(text: &str) -> Option<Url> {
    let url = Url::parse(text).ok()?;
    if !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    let allowed = match url.scheme() {
        "https" => url.host().is_some(),
        "http" => is_this_computer(url.host()),
        _ => false,
    };
    allowed.then_some(url)
}

fn is_this_computer(host: Option<Host<&str>>) -> bool {
    match host {
        Some(Host::Domain(name)) => name == "localhost",
        Some(Host::Ipv4(address)) => IpAddr::V4(address).is_loopback(),
        Some(Host::Ipv6(address)) => IpAddr::V6(address).is_loopback(),
        None => false,
    }
}

/// Where the sign-in window goes: four fifths of `owner`'s size, at least
/// [`MIN_WIDTH`] by [`MIN_HEIGHT`] and at most `work_area`, centred on
/// `owner` and moved inside `work_area` where it would cross its edge. All
/// in physical pixels.
pub fn popup_rect(owner: Rect, work_area: Rect) -> Rect {
    let width = share(owner.width, MIN_WIDTH, work_area.width);
    let height = share(owner.height, MIN_HEIGHT, work_area.height);
    Rect {
        x: centred(owner.x, owner.width, width, work_area.x, work_area.width),
        y: centred(owner.y, owner.height, height, work_area.y, work_area.height),
        width,
        height,
    }
}

fn share(owner: u32, least: u32, most: u32) -> u32 {
    let wanted = u64::from(owner) * SHARE_IN_FIFTHS / 5;
    let wanted = u32::try_from(wanted).unwrap_or(u32::MAX);
    wanted.max(least).min(most)
}

/// The start of a `size` span centred on the owner's span, kept inside the
/// area's span.
fn centred(owner_start: i32, owner_size: u32, size: u32, area_start: i32, area_size: u32) -> i32 {
    let start = i64::from(owner_start) + (i64::from(owner_size) - i64::from(size)) / 2;
    let last_start = i64::from(area_start) + i64::from(area_size) - i64::from(size);
    let start = start.min(last_start).max(i64::from(area_start));
    i32::try_from(start).unwrap_or(area_start)
}

/// The browser's command line: the address as one `--app=` argument, and
/// the window's size and place. Each is one argument of its own, started
/// without a shell, so nothing in the address can add another.
pub fn launch_arguments(url: &Url, rect: Rect) -> [String; 3] {
    [
        format!("--app={url}"),
        format!("--window-size={},{}", rect.width, rect.height),
        format!("--window-position={},{}", rect.x, rect.y),
    ]
}

/// What the browser's windows show after the start, next to the ones it
/// had before.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NewWindows {
    None,
    One(Handle),
    /// More than one, so the shell can't tell which is the sign-in.
    Several(usize),
}

/// The visible windows in `now` whose handle wasn't in `before`, hidden or
/// not: a window the browser had hidden and shows later isn't the new one.
pub fn new_windows(before: &[Handle], now: &[BrowserWindow]) -> NewWindows {
    let mut new = now
        .iter()
        .filter(|window| window.visible && !before.contains(&window.handle));
    match (new.next(), new.count()) {
        (None, _) => NewWindows::None,
        (Some(window), 0) => NewWindows::One(window.handle),
        (Some(_), others) => NewWindows::Several(others + 1),
    }
}
