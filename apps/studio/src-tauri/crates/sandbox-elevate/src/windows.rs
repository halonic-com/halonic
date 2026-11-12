//! The helper's [`Machine`] on Windows, through `windows-sys`.

mod signer;

use crate::{Machine, UNINSTALL_KEY, Value};
use std::ffi::{OsStr, OsString, c_void};
use std::io::{self, Write};
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
use std::os::windows::io::{AsRawHandle, FromRawHandle};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::ptr;
use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_FILE_NOT_FOUND, GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE, LocalFree,
};
use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::{
    DACL_SECURITY_INFORMATION, GetTokenInformation, OWNER_SECURITY_INFORMATION,
    PROTECTED_DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES,
    SetFileSecurityW, TOKEN_ELEVATION, TOKEN_QUERY, TokenElevation,
};
use windows_sys::Win32::Storage::FileSystem::{
    BY_HANDLE_FILE_INFORMATION, CREATE_NEW, CreateFileW, FILE_ATTRIBUTE_NORMAL,
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_BACKUP_SEMANTICS, GetFileInformationByHandle,
    MOVEFILE_DELAY_UNTIL_REBOOT, MoveFileExW,
};
use windows_sys::Win32::System::Com::CoTaskMemFree;
use windows_sys::Win32::System::LibraryLoader::{
    LOAD_LIBRARY_SEARCH_SYSTEM32, SetDefaultDllDirectories,
};
use windows_sys::Win32::System::Registry::{
    HKEY, HKEY_LOCAL_MACHINE, KEY_SET_VALUE, KEY_WOW64_64KEY, REG_DWORD, REG_OPTION_NON_VOLATILE,
    REG_SZ, RegCloseKey, RegCreateKeyExW, RegDeleteKeyExW, RegSetValueExW,
};
use windows_sys::Win32::System::SystemInformation::{
    GetSystemDirectoryW, GetSystemWindowsDirectoryW,
};
use windows_sys::Win32::System::Threading::{
    CREATE_NO_WINDOW, GetCurrentProcess, OpenProcessToken,
};
use windows_sys::Win32::UI::Shell::{
    FOLDERID_ProgramData, FOLDERID_ProgramFiles, FOLDERID_Public, KF_FLAG_DEFAULT,
    SHGetKnownFolderPath,
};
use windows_sys::core::GUID;

/// Owner Administrators; Administrators and SYSTEM full control, Users read
/// and run, for the folder and everything in it; nothing inherited.
const FOLDER_ACCESS: &str = "O:BAD:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FRFX;;;BU)";

/// A file in the folder before it's checked: owner Administrators,
/// Administrators and SYSTEM full control, nobody else (HAL-7386).
const PRIVATE_ACCESS: &str = "O:BAD:P(A;;FA;;;SY)(A;;FA;;;BA)";

/// A file in the folder once it's checked: as [`FOLDER_ACCESS`].
const SHARED_ACCESS: &str = "O:BAD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FRFX;;;BU)";

/// Makes every library this process loads from now on come from System32
/// only. The link flag in `build.rs` covers the libraries in the import
/// table; this covers the ones Windows loads later on the helper's behalf,
/// such as profapi.dll behind `SHGetKnownFolderPath`, which would otherwise
/// be looked for in the app folder first (HAL-1415, risk 2). Call it before
/// anything else.
pub fn system32_only_libraries() -> io::Result<()> {
    // SAFETY: takes only a flag value and touches no memory of ours.
    if unsafe { SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

/// The real computer.
pub struct Windows;

impl Machine for Windows {
    fn elevated(&self) -> bool {
        let mut token: HANDLE = ptr::null_mut();
        // SAFETY: the pseudo-handle from `GetCurrentProcess` needs no closing,
        // and `token` outlives the call.
        if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut size = 0u32;
        // SAFETY: `token` is open; `elevation` is the struct `TokenElevation`
        // asks for, with its size, and both outlive the call.
        let read = unsafe {
            GetTokenInformation(
                token,
                TokenElevation,
                (&raw mut elevation).cast::<c_void>(),
                size_of::<TOKEN_ELEVATION>() as u32,
                &mut size,
            )
        };
        // SAFETY: `token` is open, and this closes it exactly once.
        unsafe { CloseHandle(token) };
        read != 0 && elevation.TokenIsElevated != 0
    }

    fn program_files(&self) -> io::Result<PathBuf> {
        known_folder(&FOLDERID_ProgramFiles)
    }

    fn program_data(&self) -> io::Result<PathBuf> {
        known_folder(&FOLDERID_ProgramData)
    }

    fn public(&self) -> io::Result<PathBuf> {
        known_folder(&FOLDERID_Public)
    }

    fn windows_folder(&self) -> io::Result<PathBuf> {
        let mut buffer = [0u16; 260];
        // SAFETY: `buffer` and its length in units outlive the call.
        let length = unsafe { GetSystemWindowsDirectoryW(buffer.as_mut_ptr(), buffer.len() as u32) }
            as usize;
        if length == 0 || length >= buffer.len() {
            return Err(io::Error::last_os_error());
        }
        Ok(PathBuf::from(OsString::from_wide(&buffer[..length])))
    }

    fn system_folder(&self) -> io::Result<PathBuf> {
        let mut buffer = [0u16; 260];
        // SAFETY: `buffer` and its length in units outlive the call.
        let length =
            unsafe { GetSystemDirectoryW(buffer.as_mut_ptr(), buffer.len() as u32) } as usize;
        if length == 0 || length >= buffer.len() {
            return Err(io::Error::last_os_error());
        }
        Ok(PathBuf::from(OsString::from_wide(&buffer[..length])))
    }

    fn own_path(&self) -> io::Result<PathBuf> {
        std::env::current_exe()
    }

    fn protect_folder(&self, folder: &Path) -> io::Result<()> {
        match std::fs::create_dir(folder) {
            Err(error) if error.kind() != io::ErrorKind::AlreadyExists => return Err(error),
            _ => {}
        }
        let metadata = std::fs::symlink_metadata(folder)?;
        if !metadata.is_dir() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(io::Error::other("not a plain folder"));
        }
        set_access(folder, FOLDER_ACCESS)
    }

    fn write_private(&self, to: &Path, bytes: &[u8]) -> io::Result<()> {
        match std::fs::remove_file(to) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => return Err(error),
            _ => {}
        }
        with_descriptor(PRIVATE_ACCESS, |descriptor| {
            let attributes = SECURITY_ATTRIBUTES {
                nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: descriptor,
                bInheritHandle: 0,
            };
            let path = wide(to.as_os_str());
            // SAFETY: `path` is NUL-terminated and `attributes` points at the
            // descriptor, which outlives the call. `CREATE_NEW` fails on any
            // name already there, a link included.
            let handle = unsafe {
                CreateFileW(
                    path.as_ptr(),
                    GENERIC_WRITE,
                    0,
                    &attributes,
                    CREATE_NEW,
                    FILE_ATTRIBUTE_NORMAL,
                    ptr::null_mut(),
                )
            };
            if handle == INVALID_HANDLE_VALUE {
                return Err(io::Error::last_os_error());
            }
            // SAFETY: `handle` was just opened and nothing else owns it; the
            // `File` closes it once.
            let mut file = unsafe { std::fs::File::from_raw_handle(handle) };
            file.write_all(bytes)
        })
    }

    fn share(&self, file: &Path) -> io::Result<()> {
        set_access(file, SHARED_ACCESS)
    }

    fn same_file(&self, one: &Path, other: &Path) -> bool {
        match (file_id(one), file_id(other)) {
            (Ok(one), Ok(other)) => one == other,
            _ => false,
        }
    }

    fn signer(&self, file: &Path) -> Option<String> {
        signer::signer(file)
    }

    fn read(&self, file: &Path) -> io::Result<Vec<u8>> {
        std::fs::read(file)
    }

    fn exists(&self, file: &Path) -> bool {
        file.is_file()
    }

    fn run(
        &self,
        program: &Path,
        args: &[&str],
        folder: &Path,
        environment: &[(&'static str, OsString)],
    ) -> io::Result<i32> {
        let status = Command::new(program)
            .args(args)
            .current_dir(folder)
            .env_clear()
            .envs(environment.iter().map(|(name, value)| (name, value)))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status()?;
        Ok(status.code().unwrap_or(1))
    }

    fn write_entry(&self, values: &[(&'static str, Value)]) -> io::Result<()> {
        let key = wide(OsStr::new(UNINSTALL_KEY));
        let mut handle: HKEY = ptr::null_mut();
        // SAFETY: `key` is NUL-terminated and `handle` outlives the call.
        let made = unsafe {
            RegCreateKeyExW(
                HKEY_LOCAL_MACHINE,
                key.as_ptr(),
                0,
                ptr::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_SET_VALUE | KEY_WOW64_64KEY,
                ptr::null(),
                &mut handle,
                ptr::null_mut(),
            )
        };
        if made != 0 {
            return Err(io::Error::from_raw_os_error(made as i32));
        }
        let mut result = Ok(());
        for (name, value) in values {
            let name = wide(OsStr::new(name));
            let (kind, bytes) = match value {
                Value::Text(text) => (
                    REG_SZ,
                    wide(OsStr::new(text))
                        .iter()
                        .flat_map(|unit| unit.to_le_bytes())
                        .collect::<Vec<u8>>(),
                ),
                Value::Number(number) => (REG_DWORD, number.to_le_bytes().to_vec()),
            };
            // SAFETY: `handle` is open, `name` is NUL-terminated, and `bytes`
            // (a string with its NUL, or a DWORD) and its length outlive the call.
            let set = unsafe {
                RegSetValueExW(
                    handle,
                    name.as_ptr(),
                    0,
                    kind,
                    bytes.as_ptr(),
                    bytes.len() as u32,
                )
            };
            if set != 0 {
                result = Err(io::Error::from_raw_os_error(set as i32));
                break;
            }
        }
        // SAFETY: `handle` is open, and this closes it exactly once.
        unsafe { RegCloseKey(handle) };
        result
    }

    fn delete_entry(&self) -> io::Result<()> {
        let key = wide(OsStr::new(UNINSTALL_KEY));
        // SAFETY: `key` is NUL-terminated.
        let deleted =
            unsafe { RegDeleteKeyExW(HKEY_LOCAL_MACHINE, key.as_ptr(), KEY_WOW64_64KEY, 0) };
        match deleted {
            0 | ERROR_FILE_NOT_FOUND => Ok(()),
            error => Err(io::Error::from_raw_os_error(error as i32)),
        }
    }

    fn delete(&self, path: &Path) {
        let gone = if path.is_dir() {
            std::fs::remove_dir_all(path)
        } else {
            std::fs::remove_file(path)
        };
        if matches!(&gone, Err(error) if error.kind() != io::ErrorKind::NotFound) {
            let path = wide(path.as_os_str());
            // SAFETY: `path` is NUL-terminated; a null new name means delete.
            unsafe { MoveFileExW(path.as_ptr(), ptr::null(), MOVEFILE_DELAY_UNTIL_REBOOT) };
        }
    }
}

/// Gives `path` the owner and access list in `access`, inheriting nothing.
fn set_access(path: &Path, access: &str) -> io::Result<()> {
    with_descriptor(access, |descriptor| {
        let path = wide(path.as_os_str());
        // SAFETY: `path` is NUL-terminated and `descriptor` is valid for the call.
        let set = unsafe {
            SetFileSecurityW(
                path.as_ptr(),
                OWNER_SECURITY_INFORMATION
                    | DACL_SECURITY_INFORMATION
                    | PROTECTED_DACL_SECURITY_INFORMATION,
                descriptor,
            )
        };
        if set == 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    })
}

/// Runs `with` on the security descriptor `access` describes, then frees it.
fn with_descriptor<T>(
    access: &str,
    with: impl FnOnce(PSECURITY_DESCRIPTOR) -> io::Result<T>,
) -> io::Result<T> {
    let access = wide(OsStr::new(access));
    let mut descriptor: PSECURITY_DESCRIPTOR = ptr::null_mut();
    // SAFETY: `access` is NUL-terminated; `descriptor` outlives the call
    // and on success holds memory this code frees below.
    let made = unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            access.as_ptr(),
            SDDL_REVISION_1,
            &mut descriptor,
            ptr::null_mut(),
        )
    };
    if made == 0 {
        return Err(io::Error::last_os_error());
    }
    let result = with(descriptor);
    // SAFETY: `descriptor` was allocated by the conversion, freed once.
    unsafe { LocalFree(descriptor) };
    result
}

/// The volume and file index that name `path`'s file or folder on this
/// computer, whatever name reached it.
fn file_id(path: &Path) -> io::Result<(u32, u32, u32)> {
    // No access asked for, only the name's identity. Backup semantics opens
    // a folder too; links are followed, so a link to the folder is the folder.
    let file = std::fs::OpenOptions::new()
        .access_mode(0)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
        .open(path)?;
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    // SAFETY: `file` is open for the call, and `info` outlives it.
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok((
        info.dwVolumeSerialNumber,
        info.nFileIndexHigh,
        info.nFileIndexLow,
    ))
}

/// A folder Windows knows by `id`, from Windows rather than the environment.
fn known_folder(id: &GUID) -> io::Result<PathBuf> {
    let mut path = ptr::null_mut();
    // SAFETY: `id` and `path` outlive the call.
    // On success it holds a string this code frees below.
    let result =
        unsafe { SHGetKnownFolderPath(id, KF_FLAG_DEFAULT as u32, ptr::null_mut(), &mut path) };
    let folder = if result >= 0 {
        let mut length = 0;
        // SAFETY: on success `path` is a NUL-terminated wide string, and
        // this stops at its NUL.
        while unsafe { *path.add(length) } != 0 {
            length += 1;
        }
        // SAFETY: `path` holds `length` units before the NUL.
        let units = unsafe { std::slice::from_raw_parts(path, length) };
        Ok(PathBuf::from(OsString::from_wide(units)))
    } else {
        Err(io::Error::from_raw_os_error(result))
    };
    // SAFETY: Windows asks the caller to free `path` whatever the result;
    // null is allowed.
    unsafe { CoTaskMemFree(path.cast::<c_void>()) };
    folder
}

/// `text` as a NUL-terminated wide string.
pub(crate) fn wide(text: &OsStr) -> Vec<u16> {
    text.encode_wide().chain(Some(0)).collect()
}
