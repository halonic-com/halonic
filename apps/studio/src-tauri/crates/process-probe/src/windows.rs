//! The probe on Windows, through `windows-sys`, following libuv's `uv_kill`
//! and `uv_os_gethostname`.

use std::mem::MaybeUninit;
use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_ACCESS_DENIED, GetLastError, STILL_ACTIVE,
};
use windows_sys::Win32::Networking::WinSock::{GetHostNameW, WSACleanup, WSADATA, WSAStartup};
use windows_sys::Win32::System::Threading::{
    GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};

/// libuv's `UV_MAXHOSTNAMESIZE` on Windows, in UTF-16 units.
const HOST_NAME_BUFFER: usize = 256;

/// Winsock 2.2, the version libuv starts.
const WINSOCK_VERSION: u16 = 0x0202;

pub(crate) fn process_alive(pid: i32) -> bool {
    // The caller passes only ids above 0, so the cast keeps the value.
    let pid = pid as u32;
    // SAFETY: `OpenProcess` takes plain values and returns a handle or null.
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return access_denied();
    }
    let mut exit_code = 0u32;
    // SAFETY: `handle` is the open handle from above, and `exit_code`
    // outlives the call.
    let read = unsafe { GetExitCodeProcess(handle, &mut exit_code) };
    // Read the error before `CloseHandle` can change it.
    let alive = if read != 0 {
        // A process that has exited can still be opened while anyone holds
        // a handle to it; only its exit code tells.
        exit_code == STILL_ACTIVE as u32
    } else {
        access_denied()
    };
    // SAFETY: `handle` is open, and this closes it exactly once.
    unsafe { CloseHandle(handle) };
    alive
}

/// Whether the last call failed for want of access, which Node reads as
/// "the process runs, but isn't ours" (`EPERM`). Any other failure, such as
/// `ERROR_INVALID_PARAMETER` for an id no process has, means it doesn't run.
fn access_denied() -> bool {
    // SAFETY: `GetLastError` only reads this thread's last error code.
    let error = unsafe { GetLastError() };
    error == ERROR_ACCESS_DENIED
}

pub(crate) fn host_name() -> Option<String> {
    let mut data = MaybeUninit::<WSADATA>::uninit();
    // SAFETY: `WSAStartup` writes into `data`, which outlives the call.
    // `GetHostNameW` fails unless Winsock was started first.
    if unsafe { WSAStartup(WINSOCK_VERSION, data.as_mut_ptr()) } != 0 {
        return None;
    }
    let mut buffer = [0u16; HOST_NAME_BUFFER];
    // SAFETY: the pointer and length describe `buffer`, which outlives the
    // call; `GetHostNameW` writes at most that many units into it.
    let result = unsafe { GetHostNameW(buffer.as_mut_ptr(), HOST_NAME_BUFFER as i32) };
    // SAFETY: balances the `WSAStartup` above, which succeeded; Winsock
    // counts its starts, so this never stops another user's.
    unsafe { WSACleanup() };
    if result != 0 {
        return None;
    }
    let end = buffer.iter().position(|&unit| unit == 0)?;
    String::from_utf16(&buffer[..end]).ok()
}
