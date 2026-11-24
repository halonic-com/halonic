//! The real Windows calls behind the checks of HAL-7385's S-4 and S-5, and
//! the helper's opens in the app folder (HAL-17788). The steps themselves
//! are tested in `steps.rs`.
#![cfg(windows)]

use halonic_sandbox_elevate::{Machine, SRT_WIN, Windows};
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{PIPE_ACCESS_OUTBOUND, WriteFile};
use windows_sys::Win32::System::Pipes::{ConnectNamedPipe, CreateNamedPipeW, PIPE_TYPE_BYTE};

/// A new, empty folder for one test.
fn scratch(name: &str) -> PathBuf {
    let folder = std::env::temp_dir().join(format!("halonic-sandbox-elevate-{name}"));
    let _ = std::fs::remove_dir_all(&folder);
    std::fs::create_dir_all(&folder).expect("a scratch folder");
    folder
}

#[test]
fn sandbox_elevate_knows_a_file_and_a_folder_by_any_letter_case() {
    let folder = scratch("same-file");
    let file = folder.join("one.exe");
    std::fs::write(&file, b"one").expect("a file");
    std::fs::write(folder.join("two.exe"), b"two").expect("a file");
    let upper = |path: &PathBuf| PathBuf::from(path.to_string_lossy().to_uppercase());
    assert!(Windows.same_file(&file, &upper(&file)));
    assert!(Windows.same_file(&folder, &upper(&folder)));
    assert!(!Windows.same_file(&file, &folder.join("two.exe")));
    // A name that reaches nothing is never the same file.
    assert!(!Windows.same_file(&folder.join("none.exe"), &folder.join("none.exe")));
    let _ = std::fs::remove_dir_all(&folder);
}

#[test]
fn sandbox_elevate_finds_no_publisher_on_an_unsigned_file() {
    // Test executables aren't signed.
    let own = std::env::current_exe().expect("this test's own path");
    assert_eq!(Windows.signer(&own), None);
}

/// Run by CI with a signed file and the publisher PowerShell reads from it,
/// so the helper reads publishers as Windows shows them.
#[test]
#[ignore = "needs HALONIC_SIGNED_FILE and HALONIC_SIGNED_PUBLISHER"]
fn sandbox_elevate_reads_the_publisher_windows_shows_and_refuses_a_changed_file() {
    let signed = PathBuf::from(std::env::var_os("HALONIC_SIGNED_FILE").expect("a signed file"));
    let publisher = std::env::var("HALONIC_SIGNED_PUBLISHER").expect("its publisher");
    assert_eq!(Windows.signer(&signed).as_deref(), Some(publisher.as_str()));
    // One byte changed in the middle, and the signature no longer holds.
    let folder = scratch("changed");
    let changed = folder.join("changed.exe");
    let mut bytes = std::fs::read(&signed).expect("the signed file");
    let middle = bytes.len() / 2;
    bytes[middle] ^= 0xff;
    std::fs::write(&changed, bytes).expect("the changed copy");
    assert_eq!(Windows.signer(&changed), None);
    let _ = std::fs::remove_dir_all(&folder);
}

#[test]
fn sandbox_elevate_refuses_a_link_where_srt_win_should_be() {
    let folder = scratch("link");
    let elsewhere = folder.join("elsewhere.exe");
    std::fs::write(&elsewhere, b"srt-win as shipped").expect("a file");
    let link = folder.join(SRT_WIN);
    std::os::windows::fs::symlink_file(&elsewhere, &link).expect("a link");
    // The name is there, so setup refuses it rather than call it missing.
    assert!(Windows.exists(&link));
    let refused = Windows.read(&link).expect_err("a link is refused");
    assert_eq!(refused.to_string(), "not a plain file");
    let _ = std::fs::remove_dir_all(&folder);
}

#[test]
fn sandbox_elevate_refuses_a_named_pipe_where_srt_win_should_be() {
    let name = format!(r"\\.\pipe\halonic-sandbox-elevate-{}", std::process::id());
    let (ready, is_ready) = mpsc::channel();
    let server = std::thread::spawn({
        let name = name.clone();
        move || serve_once(&name, &ready)
    });
    is_ready.recv().expect("the pipe is served");
    let read = Windows.read(Path::new(&name));
    // Lets the server go on if the helper never connected; a pipe the
    // helper already connected to and closed refuses this one.
    let _ = std::fs::File::open(&name);
    server.join().expect("the server finished");
    let refused = read.expect_err("a named pipe is refused");
    assert_eq!(refused.to_string(), "not a plain file");
}

/// Serves one client on the pipe `name`: tells `ready` once it listens,
/// then writes bytes that look like srt-win to whoever connects.
fn serve_once(name: &str, ready: &mpsc::Sender<()>) {
    let wide: Vec<u16> = OsStr::new(name).encode_wide().chain(Some(0)).collect();
    // SAFETY: `wide` is NUL-terminated and outlives the call; no security
    // attributes are passed.
    let pipe = unsafe {
        CreateNamedPipeW(
            wide.as_ptr(),
            PIPE_ACCESS_OUTBOUND,
            PIPE_TYPE_BYTE,
            1,
            64,
            64,
            0,
            std::ptr::null(),
        )
    };
    assert_ne!(pipe, INVALID_HANDLE_VALUE, "a named pipe");
    ready.send(()).expect("the test waits");
    let bytes = b"srt-win as shipped";
    let mut written = 0u32;
    // SAFETY: `pipe` is open; `bytes` and `written` outlive the calls, which
    // aren't overlapped. Either may fail once the client has gone.
    unsafe {
        ConnectNamedPipe(pipe, std::ptr::null_mut());
        WriteFile(
            pipe,
            bytes.as_ptr(),
            bytes.len() as u32,
            &mut written,
            std::ptr::null_mut(),
        );
    }
    // SAFETY: `pipe` is open, and this closes it exactly once.
    unsafe { CloseHandle(pipe) };
}
