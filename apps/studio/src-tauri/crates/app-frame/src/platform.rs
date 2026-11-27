//! What Halonic does with a frame's window, through `windows-sys`: find the
//! process behind it, give it the page's title, bring it forward, and read
//! the size Halonic's window fills. Each takes a window handle as a plain
//! number; Windows checks it and answers an error for one that names no
//! window.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;

use windows_sys::Win32::Foundation::{CloseHandle, HWND, RECT};
use windows_sys::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GA_ROOT, GetAncestor, GetClientRect, GetWindowThreadProcessId, IsIconic, IsWindow,
    PostMessageW, SW_RESTORE, SW_SHOW, SetForegroundWindow, SetWindowTextW, ShowWindow, WM_CLOSE,
};

use crate::{FrameApp, frame_exe};

fn hwnd(handle: isize) -> HWND {
    handle as HWND
}

/// The exe of the process that owns the window `handle`, or `None` when it
/// names no window or Windows won't say.
pub fn process_image(handle: isize) -> Option<PathBuf> {
    let mut process_id = 0u32;
    // SAFETY: Windows checks the handle; the id is written to a local.
    let thread = unsafe { GetWindowThreadProcessId(hwnd(handle), &mut process_id) };
    if thread == 0 || process_id == 0 {
        return None;
    }
    // SAFETY: no pointers; a null answer means no access.
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id) };
    if process.is_null() {
        return None;
    }
    let mut buffer = vec![0u16; 32_768];
    let mut length = buffer.len() as u32;
    // SAFETY: the buffer holds `length` UTF-16 units, and Windows writes no
    // more and puts the count written back in `length`.
    let read = unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            buffer.as_mut_ptr(),
            &mut length,
        )
    };
    // SAFETY: the handle came from `OpenProcess` above and is closed once.
    unsafe { CloseHandle(process) };
    if read == 0 {
        return None;
    }
    buffer.truncate(length as usize);
    Some(PathBuf::from(String::from_utf16_lossy(&buffer)))
}

/// The top-level window `handle` sits in: the frame for Halonic's window
/// in a frame, the window itself otherwise.
pub fn root(handle: isize) -> isize {
    // SAFETY: Windows checks the handle and answers null for a bad one.
    let root = unsafe { GetAncestor(hwnd(handle), GA_ROOT) };
    if root.is_null() {
        handle
    } else {
        root as isize
    }
}

/// Gives the window `handle` the title `title`. An error says it was
/// refused; the window keeps the title it had.
pub fn set_text(handle: isize, title: &str) -> Result<(), String> {
    let wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY: the title ends in a 0 and lives through the call.
    if unsafe { SetWindowTextW(hwnd(handle), wide.as_ptr()) } == 0 {
        return Err("Windows refused the frame's title".to_owned());
    }
    Ok(())
}

/// Shows the top-level window `handle`, restored if it was minimised, in
/// front. Windows may only flash its taskbar entry when another app has
/// the focus; the frame that just started allows Halonic to come forward.
pub fn bring_forward(handle: isize) -> Result<(), String> {
    // SAFETY: Windows checks the handle in each call.
    unsafe {
        if IsWindow(hwnd(handle)) == 0 {
            return Err("the frame is gone".to_owned());
        }
        ShowWindow(
            hwnd(handle),
            if IsIconic(hwnd(handle)) != 0 {
                SW_RESTORE
            } else {
                SW_SHOW
            },
        );
        SetForegroundWindow(hwnd(handle));
    }
    Ok(())
}

/// The size of the window `handle`'s inside, in physical pixels, or `None`
/// when it names no window.
pub fn client_size(handle: isize) -> Option<(u32, u32)> {
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    // SAFETY: Windows checks the handle and writes into the local rect.
    if unsafe { GetClientRect(hwnd(handle), &mut rect) } == 0 {
        return None;
    }
    let width = u32::try_from(rect.right - rect.left).ok()?;
    let height = u32::try_from(rect.bottom - rect.top).ok()?;
    Some((width, height))
}

/// Asks the frame `handle` to colour its title bar `caption`. An error says
/// the frame didn't take the message; its bar keeps its colour.
pub fn colour_caption(handle: isize, caption: halonic_window_caption::Rgb) -> Result<(), String> {
    let colour = halonic_window_caption::colorref(caption) as usize;
    // SAFETY: Windows checks the handle; the message carries no pointer.
    if unsafe { PostMessageW(hwnd(handle), crate::CAPTION_MESSAGE, colour, 0) } == 0 {
        return Err("the frame didn't take its title bar's colour".to_owned());
    }
    Ok(())
}

/// Asks the frame `handle` to close. A frame with Halonic's window in it
/// passes the request on to that window. An error says it didn't take it.
pub fn close(handle: isize) -> Result<(), String> {
    // SAFETY: Windows checks the handle; the message carries no pointer.
    if unsafe { PostMessageW(hwnd(handle), WM_CLOSE, 0, 0) } == 0 {
        return Err("the frame didn't take the request to close".to_owned());
    }
    Ok(())
}

/// Starts `app`'s frame from `folder`, Halonic's own. `Ok(false)` when the
/// folder holds no frame for it, as in a build that doesn't ship them.
pub fn start_frame(folder: &Path, app: FrameApp) -> std::io::Result<bool> {
    let Some(frame) = frame_exe(folder, app) else {
        return Ok(false);
    };
    new_command(frame).spawn().map(|_| true)
}

/// The crate's one way to make a command (HAL-13197). Halonic and the
/// frames are GUI programs, so they open no console window anyway.
#[expect(
    clippy::disallowed_methods,
    reason = "the crate's one Command::new; it starts GUI programs only, which open no console"
)]
pub(crate) fn new_command(program: impl AsRef<OsStr>) -> Command {
    Command::new(program)
}
