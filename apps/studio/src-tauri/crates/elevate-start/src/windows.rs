//! The start on Windows, through `windows-sys`: `ShellExecuteExW` with the
//! `runas` verb, as the installer does (HAL-14812).

use crate::{Launch, StartError, Verb, Wait};
use std::ffi::{OsStr, c_void};
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::ptr;
use std::time::Duration;
use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_CANCELLED, GetLastError, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::System::Com::{
    COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE, CoInitializeEx, CoUninitialize,
};
use windows_sys::Win32::System::Threading::{GetExitCodeProcess, INFINITE, WaitForSingleObject};
use windows_sys::Win32::UI::Shell::{
    SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW, ShellExecuteExW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

/// The real Windows.
pub struct Windows;

/// A started helper: its process handle, closed when dropped. Closing it
/// doesn't stop the helper.
pub struct Process(HANDLE);

// SAFETY: a process handle is a plain kernel handle that any thread may
// wait on or close; only `Drop` closes it, once.
unsafe impl Send for Process {}

impl Drop for Process {
    fn drop(&mut self) {
        // SAFETY: the handle is open and owned here, and this closes it once.
        unsafe { CloseHandle(self.0) };
    }
}

impl Launch for Windows {
    type Process = Process;

    fn start(&self, helper: &Path, verb: Verb, owner: isize) -> Result<Process, StartError> {
        start(helper, OsStr::new(verb.argument()), owner)
    }

    fn wait(&self, process: &Process, limit: Duration) -> Result<Wait, String> {
        wait(process, limit)
    }
}

/// Starts `program` with `argument` and the administrator prompt, hidden,
/// in the program's own folder, owned by the window `owner`.
fn start(program: &Path, argument: &OsStr, owner: isize) -> Result<Process, StartError> {
    let verb = wide(OsStr::new("runas"));
    let file = wide(program.as_os_str());
    let parameters = wide(argument);
    let folder = wide(program.parent().unwrap_or(program).as_os_str());
    // SAFETY: an all-zero SHELLEXECUTEINFOW is valid: null pointers and handles, no flags.
    let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    info.cbSize = size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
    info.hwnd = owner as *mut c_void;
    info.lpVerb = verb.as_ptr();
    info.lpFile = file.as_ptr();
    info.lpParameters = parameters.as_ptr();
    info.lpDirectory = folder.as_ptr();
    info.nShow = SW_HIDE;
    // Windows asks for COM before ShellExecuteExW, which may hand the start
    // to a shell extension.
    // SAFETY: plain values; a call that succeeds is balanced below.
    let com = unsafe {
        CoInitializeEx(
            ptr::null(),
            (COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) as u32,
        )
    };
    // SAFETY: `info` and the strings it points to outlive the call.
    let started = unsafe { ShellExecuteExW(&mut info) };
    // SAFETY: plain call, read before anything else can change it.
    let error = unsafe { GetLastError() };
    if com >= 0 {
        // SAFETY: balances the CoInitializeEx above that succeeded.
        unsafe { CoUninitialize() };
    }
    if started == 0 {
        if error == ERROR_CANCELLED {
            return Err(StartError::Cancelled);
        }
        let reason = io::Error::from_raw_os_error(error as i32).to_string();
        return Err(StartError::Other(reason));
    }
    if info.hProcess.is_null() {
        return Err(StartError::Other(
            "Windows started the helper without giving its process".to_owned(),
        ));
    }
    Ok(Process(info.hProcess))
}

/// Waits at most `limit` for `process`, and reads its exit code once it ends.
fn wait(process: &Process, limit: Duration) -> Result<Wait, String> {
    // INFINITE is u32::MAX: stay below it.
    let ms = u32::try_from(limit.as_millis())
        .unwrap_or(INFINITE - 1)
        .min(INFINITE - 1);
    // SAFETY: the handle is open while `process` lives.
    let waited = unsafe { WaitForSingleObject(process.0, ms) };
    if waited == WAIT_TIMEOUT {
        return Ok(Wait::Running);
    }
    if waited != WAIT_OBJECT_0 {
        return Err(format!(
            "Windows couldn't wait for the helper: {}",
            io::Error::last_os_error()
        ));
    }
    let mut code = 0u32;
    // SAFETY: the handle is open, and `code` outlives the call.
    if unsafe { GetExitCodeProcess(process.0, &mut code) } == 0 {
        return Err(format!(
            "Windows didn't give the helper's exit code: {}",
            io::Error::last_os_error()
        ));
    }
    Ok(Wait::Exited(code))
}

/// `text` as a null-terminated UTF-16 string.
fn wide(text: &OsStr) -> Vec<u16> {
    text.encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
mod tests {
    //! On a real Windows, ignored in plain `cargo test`: `runas` would ask
    //! the person at the keyboard. The `tauri-windows` CI job runs them,
    //! where the runner's user is an administrator with UAC off, so Windows
    //! starts the program elevated with no prompt.

    use super::{start, wait};
    use crate::Wait;
    use std::ffi::OsStr;
    use std::path::PathBuf;
    use std::time::Duration;

    fn system32(program: &str) -> PathBuf {
        let root = std::env::var_os("SystemRoot").expect("Windows' folder");
        PathBuf::from(root).join("System32").join(program)
    }

    #[test]
    #[ignore = "runas asks for administrator rights; CI runs it"]
    fn elevate_start_gives_a_real_programs_exit_code() {
        // `whoami setup` refuses the argument and exits with 1.
        let process = start(&system32("whoami.exe"), OsStr::new("setup"), 0).expect("it starts");
        assert_eq!(wait(&process, Duration::from_secs(60)), Ok(Wait::Exited(1)));
    }

    #[test]
    #[ignore = "runas asks for administrator rights; CI runs it"]
    fn elevate_start_leaves_a_real_program_running_at_the_limit() {
        // About 5 seconds of pings to this computer.
        let program = system32("ping.exe");
        let process = start(&program, OsStr::new("-n 6 127.0.0.1"), 0).expect("it starts");
        assert_eq!(
            wait(&process, Duration::from_millis(100)),
            Ok(Wait::Running)
        );
        assert_eq!(wait(&process, Duration::from_secs(60)), Ok(Wait::Exited(0)));
    }

    #[test]
    #[ignore = "runas asks for administrator rights; CI runs it"]
    fn elevate_start_reports_a_missing_program() {
        let missing = system32("halonic-no-such-helper.exe");
        assert!(start(&missing, OsStr::new("setup"), 0).is_err());
    }
}
