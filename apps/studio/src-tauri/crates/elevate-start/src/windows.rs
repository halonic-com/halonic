//! The start on Windows, through `windows-sys`: `ShellExecuteExW` with the
//! `runas` verb, as the installer does (HAL-14812), of a helper opened
//! without sharing write or delete and checked through that handle
//! (HAL-14958).

use crate::{Launch, StartError, Verb, Wait};
use std::ffi::{OsStr, OsString, c_void};
use std::fs::{File, OpenOptions};
use std::io;
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::io::AsRawHandle;
use std::path::{Path, PathBuf};
use std::ptr;
use std::time::Duration;
use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_CANCELLED, GetLastError, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_NAME_NORMALIZED, FILE_SHARE_READ, GetFinalPathNameByHandleW, VOLUME_NAME_DOS,
};
use windows_sys::Win32::System::Com::{
    COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE, CoInitializeEx, CoUninitialize,
};
use windows_sys::Win32::System::Threading::{GetExitCodeProcess, INFINITE, WaitForSingleObject};
use windows_sys::Win32::UI::Shell::{
    SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
    ShellExecuteExW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

/// The real Windows.
pub struct Windows;

/// The helper's file, open for reading and shared for reading and running
/// only: until it is dropped, Windows refuses to write, rename or delete it,
/// or to rename a folder it is in. `path` is where that file really is,
/// with no link or junction left in it.
pub struct Opened {
    _file: File,
    path: PathBuf,
}

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
    type Opened = Opened;
    type Process = Process;

    fn open(&self, helper: &Path) -> Result<(Opened, Option<String>), String> {
        let file = OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .open(helper)
            .map_err(|error| format!("Windows couldn't open the sandbox helper: {error}"))?;
        let path = final_path(&file)
            .map_err(|error| format!("Windows didn't say where the sandbox helper is: {error}"))?;
        let signer = halonic_publisher::signer_of_open(&path, &file);
        Ok((Opened { _file: file, path }, signer))
    }

    fn start(&self, helper: &Opened, verb: Verb, owner: isize) -> Result<Process, StartError> {
        // Started by the file's real path: a junction in the path the
        // shell was given could be pointed elsewhere after the check.
        start(&helper.path, OsStr::new(verb.argument()), owner)
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
    // No UI: Windows' own error box (a missing helper, say) would wait for a
    // click; Studio says what went wrong itself.
    info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI;
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

/// Where `file` really is, without the `\\?\` prefix Windows gives it:
/// `ShellExecuteExW` doesn't take that form.
fn final_path(file: &File) -> io::Result<PathBuf> {
    let mut buffer = vec![0u16; 512];
    let length = loop {
        // SAFETY: the handle is open while `file` lives; `buffer` and its
        // length in units outlive the call, which writes at most that many.
        let length = unsafe {
            GetFinalPathNameByHandleW(
                file.as_raw_handle(),
                buffer.as_mut_ptr(),
                buffer.len() as u32,
                FILE_NAME_NORMALIZED | VOLUME_NAME_DOS,
            )
        } as usize;
        if length == 0 {
            return Err(io::Error::last_os_error());
        }
        if length < buffer.len() {
            break length;
        }
        // Too small: `length` is the size it needs, its NUL included.
        buffer.resize(length, 0);
    };
    let plain = plain_path(&buffer[..length]);
    Ok(PathBuf::from(OsString::from_wide(&plain)))
}

/// `path` without the `\\?\` prefix: dropped in front of a drive letter,
/// and `\\?\UNC\server\a` becomes `\\server\a`. Any other form is left as
/// it is.
fn plain_path(path: &[u16]) -> std::borrow::Cow<'_, [u16]> {
    let units = |text: &str| text.encode_utf16().collect::<Vec<u16>>();
    if let Some(rest) = path.strip_prefix(units(r"\\?\UNC\").as_slice()) {
        return [units(r"\\").as_slice(), rest].concat().into();
    }
    match path.strip_prefix(units(r"\\?\").as_slice()) {
        Some(rest @ [drive, colon, slash, ..])
            if *drive < 128
                && (*drive as u8).is_ascii_alphabetic()
                && *colon == u16::from(b':')
                && *slash == u16::from(b'\\') =>
        {
            rest.into()
        }
        _ => path.into(),
    }
}

/// `text` as a null-terminated UTF-16 string.
fn wide(text: &OsStr) -> Vec<u16> {
    text.encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
mod tests {
    //! On a real Windows. The starts are ignored in plain `cargo test`:
    //! `runas` would ask the person at the keyboard. The `tauri-windows` CI
    //! job runs them, where the runner's user is an administrator with UAC
    //! off, so Windows starts the program elevated with no prompt.

    use super::{Windows, plain_path, start, wait};
    use crate::{Launch, Wait};
    use std::ffi::OsStr;
    use std::fs::{self, OpenOptions};
    use std::path::PathBuf;
    use std::time::Duration;

    #[test]
    fn elevate_start_holds_the_helper_against_a_swap_until_it_starts() {
        let folder = std::env::temp_dir().join("halonic-elevate-start-open");
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).expect("a scratch folder");
        let helper = folder.join("helper.exe");
        fs::write(&helper, b"not a program").expect("a file");
        let (opened, signer) = Windows.open(&helper).expect("it opens");
        // A file of ours isn't signed.
        assert_eq!(signer, None);
        assert_eq!(opened.path.file_name(), helper.file_name());
        assert!(!opened.path.to_string_lossy().starts_with(r"\\?\"));
        assert!(OpenOptions::new().write(true).open(&helper).is_err());
        assert!(fs::rename(&helper, folder.join("other.exe")).is_err());
        assert!(fs::remove_file(&helper).is_err());
        let moved = folder.with_extension("moved");
        assert!(fs::rename(&folder, &moved).is_err());
        // Reading it, as Windows does to start it, still works.
        assert_eq!(fs::read(&helper).expect("it reads"), b"not a program");
        drop(opened);
        assert!(fs::rename(&helper, folder.join("other.exe")).is_ok());
        let _ = fs::remove_dir_all(&folder);
    }

    #[test]
    fn elevate_start_starts_the_helper_by_a_plain_path() {
        let plain = |path: &str| {
            let units: Vec<u16> = path.encode_utf16().collect();
            String::from_utf16(&plain_path(&units)).expect("text")
        };
        let drive = r"\\?\C:\Halonic\a.exe";
        assert_eq!(plain(drive), drive["\\\\?\\".len()..]);
        assert_eq!(
            plain(r"\\?\UNC\server\share\a.exe"),
            r"\\server\share\a.exe"
        );
        // Anything else stays as Windows gave it.
        let volume = r"\\?\Volume{0}\a.exe";
        assert_eq!(plain(volume), volume);
    }

    /// Run by CI with a signed file and the publisher PowerShell reads from
    /// it, so the shell reads it through its own handle as the helper does.
    #[test]
    #[ignore = "needs HALONIC_SIGNED_FILE and HALONIC_SIGNED_PUBLISHER"]
    fn elevate_start_reads_the_helpers_publisher_through_its_handle() {
        let signed = PathBuf::from(std::env::var_os("HALONIC_SIGNED_FILE").expect("a signed file"));
        let publisher = std::env::var("HALONIC_SIGNED_PUBLISHER").expect("its publisher");
        let (_opened, signer) = Windows.open(&signed).expect("it opens");
        assert_eq!(signer.as_deref(), Some(publisher.as_str()));
    }

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
