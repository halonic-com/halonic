//! Who signed a file, as the UAC prompt shows the publisher.

use super::wide;
use std::ffi::c_void;
use std::path::Path;
use std::ptr;
use windows_sys::Win32::Foundation::HANDLE;
use windows_sys::Win32::Security::Cryptography::{
    CERT_NAME_SIMPLE_DISPLAY_TYPE, CertGetNameStringW,
};
use windows_sys::Win32::Security::WinTrust::{
    WINTRUST_ACTION_GENERIC_VERIFY_V2, WINTRUST_DATA, WINTRUST_FILE_INFO,
    WTD_CACHE_ONLY_URL_RETRIEVAL, WTD_CHOICE_FILE, WTD_REVOKE_NONE, WTD_STATEACTION_CLOSE,
    WTD_STATEACTION_VERIFY, WTD_UI_NONE, WTHelperGetProvSignerFromChain,
    WTHelperProvDataFromStateData, WinVerifyTrust,
};

/// The publisher `file`'s signature names, if Windows trusts it.
pub fn signer(file: &Path) -> Option<String> {
    let path = wide(file.as_os_str());
    let mut file_info = WINTRUST_FILE_INFO {
        cbStruct: size_of::<WINTRUST_FILE_INFO>() as u32,
        pcwszFilePath: path.as_ptr(),
        hFile: ptr::null_mut(),
        pgKnownSubject: ptr::null_mut(),
    };
    // No revocation check: it would go online from an elevated process,
    // and can hang without a network. The chain must still lead to a
    // root Windows trusts, for code signing.
    let mut data = WINTRUST_DATA {
        cbStruct: size_of::<WINTRUST_DATA>() as u32,
        dwUIChoice: WTD_UI_NONE,
        fdwRevocationChecks: WTD_REVOKE_NONE,
        dwUnionChoice: WTD_CHOICE_FILE,
        dwStateAction: WTD_STATEACTION_VERIFY,
        dwProvFlags: WTD_CACHE_ONLY_URL_RETRIEVAL,
        ..WINTRUST_DATA::default()
    };
    data.Anonymous.pFile = &raw mut file_info;
    let mut action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
    // SAFETY: `data`, `file_info`, `path` and `action` outlive the call;
    // `data` points at `file_info`, which points at the NUL-terminated
    // `path`. A null window means no UI.
    let trusted = unsafe {
        WinVerifyTrust(
            ptr::null_mut(),
            &mut action,
            (&raw mut data).cast::<c_void>(),
        )
    } == 0;
    let signer = if trusted {
        // SAFETY: after a verify, `hWVTStateData` holds the state the
        // calls below read; it stays valid until the close below.
        unsafe { publisher(data.hWVTStateData) }
    } else {
        None
    };
    data.dwStateAction = WTD_STATEACTION_CLOSE;
    // SAFETY: as above; closing frees the state the verify left, once.
    unsafe {
        WinVerifyTrust(
            ptr::null_mut(),
            &mut action,
            (&raw mut data).cast::<c_void>(),
        )
    };
    signer
}

/// The name the signing certificate behind `state` shows, as the UAC prompt
/// shows the publisher.
///
/// # Safety
///
/// `state` is the `hWVTStateData` of a `WinVerifyTrust` verify that passed,
/// and not yet closed.
unsafe fn publisher(state: HANDLE) -> Option<String> {
    // SAFETY: `state` is open, as the caller promises.
    let data = unsafe { WTHelperProvDataFromStateData(state) };
    if data.is_null() {
        return None;
    }
    // SAFETY: `data` is the provider data `state` holds; signer 0 is the
    // primary signer, and no countersigner is asked for.
    let signer = unsafe { WTHelperGetProvSignerFromChain(data, 0, 0, 0) };
    // SAFETY: a non-null `signer` lives as long as `state`; its chain has
    // `csCertChain` entries, the first of which is the signing certificate.
    let certificate = unsafe {
        if signer.is_null() || (*signer).csCertChain == 0 || (*signer).pasCertChain.is_null() {
            return None;
        }
        (*(*signer).pasCertChain).pCert
    };
    if certificate.is_null() {
        return None;
    }
    let mut name = [0u16; 256];
    // SAFETY: `certificate` lives as long as `state`; `name` and its length
    // in units outlive the call, which writes at most that many, NUL included.
    let length = unsafe {
        CertGetNameStringW(
            certificate,
            CERT_NAME_SIMPLE_DISPLAY_TYPE,
            0,
            ptr::null(),
            name.as_mut_ptr(),
            name.len() as u32,
        )
    } as usize;
    // The length counts the NUL; 1 is an empty name.
    if length <= 1 || length > name.len() {
        return None;
    }
    String::from_utf16(&name[..length - 1]).ok()
}
