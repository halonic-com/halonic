//! The `Run` value and the installer's uninstall entry, under `HKCU` only.

use std::ptr;

use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS, WIN32_ERROR};
use windows_sys::Win32::System::Registry::{
    HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ, RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW,
};

use crate::LoginItemError;

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

fn failed(code: WIN32_ERROR) -> LoginItemError {
    LoginItemError::Failed(format!("Windows error {code}"))
}

/// Reads a string value under `HKCU`, `None` when it isn't there.
fn read_string(key: &str, name: &str) -> Result<Option<String>, LoginItemError> {
    let (key, name) = (wide(key), wide(name));
    let mut bytes: u32 = 0;
    // SAFETY: the key and name are NUL-terminated and outlive the call; a
    // null buffer asks only for the size, written to `bytes`.
    let code = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_SZ,
            ptr::null_mut(),
            ptr::null_mut(),
            &mut bytes,
        )
    };
    if code == ERROR_FILE_NOT_FOUND {
        return Ok(None);
    }
    if code != ERROR_SUCCESS {
        return Err(failed(code));
    }
    let mut buffer = vec![0u16; (bytes as usize).div_ceil(2)];
    // SAFETY: `buffer` holds `bytes` bytes, which the call is told, and it
    // writes no more than that.
    let code = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_SZ,
            ptr::null_mut(),
            buffer.as_mut_ptr().cast(),
            &mut bytes,
        )
    };
    if code != ERROR_SUCCESS {
        return Err(failed(code));
    }
    let length = buffer
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(buffer.len());
    Ok(Some(String::from_utf16_lossy(&buffer[..length])))
}

/// The data of the value `name` under this user's `Run` key, if it is there.
pub fn run_value(name: &str) -> Result<Option<String>, LoginItemError> {
    read_string(RUN_KEY, name)
}

/// Writes the value `name` under this user's `Run` key.
pub fn set_run_value(name: &str, data: &str) -> Result<(), LoginItemError> {
    let (key, name, data) = (wide(RUN_KEY), wide(name), wide(data));
    let size = u32::try_from(data.len() * 2).map_err(|_| LoginItemError::UnsafePath)?;
    // SAFETY: every string is NUL-terminated and outlives the call, and
    // `size` is `data`'s length in bytes, its NUL included, as REG_SZ wants.
    let code = unsafe {
        RegSetKeyValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            name.as_ptr(),
            REG_SZ,
            data.as_ptr().cast(),
            size,
        )
    };
    if code == ERROR_SUCCESS {
        Ok(())
    } else {
        Err(failed(code))
    }
}

/// Removes the value `name` from this user's `Run` key; a missing one is fine.
pub fn remove_run_value(name: &str) -> Result<(), LoginItemError> {
    let (key, name) = (wide(RUN_KEY), wide(name));
    // SAFETY: the key and name are NUL-terminated and outlive the call.
    let code = unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, key.as_ptr(), name.as_ptr()) };
    if code == ERROR_SUCCESS || code == ERROR_FILE_NOT_FOUND {
        Ok(())
    } else {
        Err(failed(code))
    }
}

/// The `InstallLocation` the installer wrote in this user's uninstall entry
/// for `product` (the installer installs for the current user only).
pub fn install_location(product: &str) -> Option<String> {
    read_string(&format!(r"{UNINSTALL_KEY}\{product}"), "InstallLocation")
        .ok()
        .flatten()
}
