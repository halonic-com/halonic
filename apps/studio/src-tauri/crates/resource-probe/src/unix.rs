//! The probe on Unix, Android included, through `libc`.

use std::ffi::CString;
use std::io;
use std::os::unix::ffi::OsStrExt;
use std::path::Path;

pub(crate) fn free_disk_bytes(folder: &Path) -> io::Result<u64> {
    let path = CString::new(folder.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "the path holds a NUL"))?;
    // SAFETY: an all-zero `statvfs` is a valid value of a plain C struct.
    let mut stats: libc::statvfs = unsafe { std::mem::zeroed() };
    // SAFETY: `path` is a NUL-terminated string and `stats` outlives the
    // call; `statvfs` writes only into `stats`.
    if unsafe { libc::statvfs(path.as_ptr(), &mut stats) } != 0 {
        return Err(io::Error::last_os_error());
    }
    // `f_bavail` counts the blocks a person without special rights may use,
    // in units of `f_frsize`. The two types differ between systems: where
    // they are already `u64`, the conversion does nothing.
    #[allow(clippy::useless_conversion)]
    let blocks = u64::from(stats.f_bavail);
    #[allow(clippy::useless_conversion)]
    let block_size = u64::from(stats.f_frsize);
    Ok(blocks.saturating_mul(block_size))
}

/// Linux and Android: the second number of `/proc/self/statm` is the
/// resident set in pages.
#[cfg(not(target_vendor = "apple"))]
pub(crate) fn process_memory_bytes() -> io::Result<u64> {
    let statm = std::fs::read_to_string("/proc/self/statm")?;
    let pages: u64 = statm
        .split_whitespace()
        .nth(1)
        .and_then(|field| field.parse().ok())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "unreadable statm"))?;
    // SAFETY: `sysconf` takes one integer and touches no memory of ours.
    let page_size = unsafe { libc::sysconf(libc::_SC_PAGESIZE) };
    let page_size = u64::try_from(page_size).map_err(|_| io::Error::last_os_error())?;
    Ok(pages.saturating_mul(page_size))
}

/// macOS and iOS: the Mach task's resident size.
#[cfg(target_vendor = "apple")]
pub(crate) fn process_memory_bytes() -> io::Result<u64> {
    use std::mem::MaybeUninit;

    let mut info = MaybeUninit::<libc::mach_task_basic_info>::uninit();
    let mut count = libc::MACH_TASK_BASIC_INFO_COUNT;
    // SAFETY: `info` and `count` outlive the call, and `count` is the size of
    // `info` in 32-bit units, which `task_info` takes as the room it has.
    // `mach_task_self_` is the task's own port, set before `main` runs.
    #[allow(deprecated)]
    let result = unsafe {
        libc::task_info(
            libc::mach_task_self_,
            libc::MACH_TASK_BASIC_INFO,
            info.as_mut_ptr().cast(),
            &mut count,
        )
    };
    if result != libc::KERN_SUCCESS {
        return Err(io::Error::other(format!("task_info failed ({result})")));
    }
    // SAFETY: `task_info` succeeded, so it filled `info`.
    Ok(unsafe { info.assume_init() }.resident_size)
}
