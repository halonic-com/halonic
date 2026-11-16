//! The probe on Windows, through `windows-sys`.

use std::io;
use std::mem::size_of;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
use windows_sys::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
use windows_sys::Win32::System::Threading::GetCurrentProcess;

pub(crate) fn free_disk_bytes(folder: &Path) -> io::Result<u64> {
    let path: Vec<u16> = folder.as_os_str().encode_wide().chain([0]).collect();
    let mut available_to_person = 0u64;
    // SAFETY: `path` is a NUL-terminated UTF-16 string and the one pointer
    // we pass, `available_to_person`, outlives the call. The other two
    // outputs are optional, and we leave them null.
    let result = unsafe {
        GetDiskFreeSpaceExW(
            path.as_ptr(),
            &mut available_to_person,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(available_to_person)
}

pub(crate) fn process_memory_bytes() -> io::Result<u64> {
    // SAFETY: an all-zero `PROCESS_MEMORY_COUNTERS` is a valid value of a
    // plain C struct.
    let mut counters: PROCESS_MEMORY_COUNTERS = unsafe { std::mem::zeroed() };
    let size = size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
    counters.cb = size;
    // SAFETY: `GetCurrentProcess` returns a pseudo handle that needs no
    // closing. `counters` outlives the call, and `size` is its size, which
    // `GetProcessMemoryInfo` takes as the room it has.
    let result = unsafe { GetProcessMemoryInfo(GetCurrentProcess(), &mut counters, size) };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(counters.WorkingSetSize as u64)
}
