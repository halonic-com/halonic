//! The probe on Unix, Android included, through `libc`.

use std::io;

/// Room for the longest host name any Unix gives (255 bytes on macOS) and
/// the NUL after it.
const HOST_NAME_BUFFER: usize = 256;

pub(crate) fn process_alive(pid: i32) -> bool {
    // SAFETY: `kill` takes two plain integers and touches no memory of ours.
    // Signal 0 sends nothing; it only checks that the process is there.
    let result = unsafe { libc::kill(pid, 0) };
    // EPERM: the process runs, as another user. ESRCH: there is none.
    result == 0 || io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

pub(crate) fn host_name() -> Option<String> {
    let mut buffer = [0u8; HOST_NAME_BUFFER];
    // SAFETY: the pointer and length describe `buffer`, which outlives the
    // call; `gethostname` writes at most that many bytes into it.
    let result = unsafe { libc::gethostname(buffer.as_mut_ptr().cast(), buffer.len()) };
    if result != 0 {
        return None;
    }
    // No NUL means the name was cut short, so it isn't the whole name.
    let end = buffer.iter().position(|&byte| byte == 0)?;
    String::from_utf8(buffer[..end].to_vec()).ok()
}
