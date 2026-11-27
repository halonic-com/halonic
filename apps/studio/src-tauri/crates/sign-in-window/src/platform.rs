//! The Windows calls, through `windows-sys`: the default browser and its
//! open command from the registry, the browser's top-level windows, and the
//! move.

use std::collections::HashMap;
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};

use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_FILE_NOT_FOUND, ERROR_SUCCESS, HWND, LPARAM,
};
use windows_sys::Win32::System::Registry::{
    HKEY, HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, RRF_RT_REG_SZ, RegGetValueW,
};
use windows_sys::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowThreadProcessId, IsWindowVisible, SWP_NOACTIVATE,
    SWP_NOZORDER, SetWindowPos,
};
use windows_sys::core::BOOL;

use crate::{BrowserWindow, Handle, Rect};

/// Where Windows keeps the default app for `https`. Windows 11 writes
/// `UserChoiceLatest` and may leave `UserChoice` behind, so it is read first.
const USER_CHOICES: [&str; 2] = [
    r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoiceLatest",
    r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice",
];

/// The window class of every Chromium browser's top-level windows.
const CHROMIUM_WINDOW_CLASS: &str = "Chrome_WidgetWin_1";

/// The ProgId of the user's default app for `https`, or `None` when no
/// default is set.
pub fn https_prog_id() -> Result<Option<String>, String> {
    for key in USER_CHOICES {
        if let Some(prog_id) = registry_text(HKEY_CURRENT_USER, key, Some("ProgId"))? {
            return Ok(Some(prog_id));
        }
    }
    Ok(None)
}

/// The `shell\open\command` of `prog_id`, which `chromium_browser` has
/// already limited to a browser's own name.
pub fn open_command(prog_id: &str) -> Result<Option<String>, String> {
    let key = format!(r"{prog_id}\shell\open\command");
    registry_text(HKEY_CLASSES_ROOT, &key, None)
}

/// A text value of the registry, or `None` when the key or value isn't there.
fn registry_text(root: HKEY, key: &str, value: Option<&str>) -> Result<Option<String>, String> {
    let wide_key = wide(key);
    let wide_value = value.map(wide);
    let value_name = wide_value.as_ref().map_or(null(), |name| name.as_ptr());
    let mut size: u32 = 0;
    // SAFETY: the key and value names are NUL-terminated and live until
    // after the call; with no data buffer Windows only writes the size.
    let status = unsafe {
        RegGetValueW(
            root,
            wide_key.as_ptr(),
            value_name,
            RRF_RT_REG_SZ,
            null_mut(),
            null_mut(),
            &raw mut size,
        )
    };
    if status == ERROR_FILE_NOT_FOUND {
        return Ok(None);
    }
    if status != ERROR_SUCCESS {
        return Err(format!("reading {key}: Windows error {status}"));
    }
    let mut buffer = vec![0u16; (size as usize).div_ceil(2)];
    let mut written = u32::try_from(buffer.len() * 2).unwrap_or(u32::MAX);
    // SAFETY: as above, and `buffer` holds `written` writable bytes.
    let status = unsafe {
        RegGetValueW(
            root,
            wide_key.as_ptr(),
            value_name,
            RRF_RT_REG_SZ,
            null_mut(),
            buffer.as_mut_ptr().cast(),
            &raw mut written,
        )
    };
    if status != ERROR_SUCCESS {
        return Err(format!("reading {key}: Windows error {status}"));
    }
    buffer.truncate(written as usize / 2);
    while buffer.last() == Some(&0) {
        buffer.pop();
    }
    Ok(Some(String::from_utf16_lossy(&buffer)))
}

/// Every top-level Chromium window of the program at `exe`, shown or not.
pub fn browser_windows(exe: &Path) -> Result<Vec<BrowserWindow>, String> {
    let mut handles: Vec<HWND> = Vec::new();
    // SAFETY: `collect` only pushes onto the Vec that the LPARAM points at,
    // which lives, and isn't borrowed elsewhere, until EnumWindows returns.
    let listed = unsafe { EnumWindows(Some(collect), (&raw mut handles) as LPARAM) };
    if listed == 0 {
        return Err(format!(
            "listing windows: {}",
            std::io::Error::last_os_error()
        ));
    }
    let mut paths: HashMap<u32, Option<PathBuf>> = HashMap::new();
    let windows = handles
        .into_iter()
        .filter(|&window| class_name(window).as_deref() == Some(CHROMIUM_WINDOW_CLASS))
        .filter(|&window| {
            let path = paths
                .entry(process_id(window))
                .or_insert_with_key(|&process| process_path(process));
            path.as_deref().is_some_and(|path| same_path(path, exe))
        })
        .map(|window| BrowserWindow {
            handle: window as Handle,
            visible: is_visible(window),
        })
        .collect();
    Ok(windows)
}

fn is_visible(window: HWND) -> bool {
    // SAFETY: no pointers; Windows checks the handle, and a window gone
    // since it was listed is "not visible".
    let visible = unsafe { IsWindowVisible(window) };
    visible != 0
}

unsafe extern "system" fn collect(window: HWND, list: LPARAM) -> BOOL {
    // SAFETY: `list` is the `&mut Vec<HWND>` that `browser_windows` passed
    // to EnumWindows, alive and not otherwise borrowed during the call.
    let handles = unsafe { &mut *(list as *mut Vec<HWND>) };
    handles.push(window);
    1
}

fn class_name(window: HWND) -> Option<String> {
    let mut buffer = [0u16; 64];
    // SAFETY: the buffer holds the count of u16s passed; Windows checks the handle.
    let length = unsafe { GetClassNameW(window, buffer.as_mut_ptr(), buffer.len() as i32) };
    let length = usize::try_from(length).ok().filter(|&length| length > 0)?;
    Some(String::from_utf16_lossy(&buffer[..length]))
}

fn process_id(window: HWND) -> u32 {
    let mut process: u32 = 0;
    // SAFETY: Windows writes one u32; it checks the handle itself.
    unsafe { GetWindowThreadProcessId(window, &raw mut process) };
    process
}

/// The program a process runs, or `None` when it can't be asked.
fn process_path(process: u32) -> Option<PathBuf> {
    // SAFETY: no pointers; a null answer is checked below.
    let opened = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process) };
    if opened.is_null() {
        return None;
    }
    let mut buffer = [0u16; 1024];
    let mut length = buffer.len() as u32;
    // SAFETY: the buffer holds `length` u16s, and `opened` is open.
    let named = unsafe {
        QueryFullProcessImageNameW(
            opened,
            PROCESS_NAME_WIN32,
            buffer.as_mut_ptr(),
            &raw mut length,
        )
    };
    // SAFETY: `opened` was opened above and is closed once, here.
    unsafe { CloseHandle(opened) };
    (named != 0).then(|| PathBuf::from(OsString::from_wide(&buffer[..length as usize])))
}

/// Windows paths don't tell case apart.
fn same_path(left: &Path, right: &Path) -> bool {
    left.as_os_str().to_string_lossy().to_lowercase()
        == right.as_os_str().to_string_lossy().to_lowercase()
}

/// Moves and sizes the window, leaving its place in front and its focus as
/// the browser set them.
pub fn move_window(handle: Handle, rect: Rect) -> Result<(), String> {
    let width = i32::try_from(rect.width).unwrap_or(i32::MAX);
    let height = i32::try_from(rect.height).unwrap_or(i32::MAX);
    // SAFETY: no pointers; Windows checks the handle and answers an error for
    // a window that has gone since it was listed.
    let moved = unsafe {
        SetWindowPos(
            handle as HWND,
            null_mut(),
            rect.x,
            rect.y,
            width,
            height,
            SWP_NOZORDER | SWP_NOACTIVATE,
        )
    };
    if moved == 0 {
        return Err(format!(
            "moving the window: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}
