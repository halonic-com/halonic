//! Debug builds only (HAL-13784): runs the `halonic-device-keys` contract
//! against the real Android Keystore, on a phone or an emulator, so the
//! Keystore path is checked on Android and not only with `FakeWrapper`.
//! CI's "Android device keys" job runs it in an emulator, with
//! `android/check-device-keys.sh`.
//!
//! The check runs when the app starts and finds the file
//! `device-key-check` in its data folder, which only the app itself or
//! `adb shell run-as` can write, and `run-as` works on debug builds only.
//! It removes that file, runs both contracts on a thread of its own (a
//! Keystore call must not run on Android's main thread) and writes `ok`, or
//! the first case that failed, to `device-key-check.result` next to it.
//! The cases only use the computers `halonic-contract-*` and forget them at
//! the end, so a paired computer's key is never touched, and a failure is
//! described without any key.
//!
//! Left out of release builds at compile time, not by a flag: lib.rs
//! declares this module only with `debug_assertions`, and so does the one
//! call in `device_keys`. The `compile_error!` below stops a release build
//! if either is ever loosened.

#[cfg(not(debug_assertions))]
compile_error!("the device key check is for debug builds only (HAL-13784)");

use std::path::Path;

use halonic_device_keys::{check_store_contract, check_wrapper_contract};
use tauri::{AppHandle, Manager, Runtime};

use crate::device_keys::{AndroidKeystore, DeviceKeys};

/// Asks for the check, in the app's data folder.
const TRIGGER: &str = "device-key-check";
/// Holds `ok`, or the first case that failed.
const RESULT: &str = "device-key-check.result";

/// Starts the check when it was asked for. Called once the shell keeps its
/// store, which the store check uses as it is.
pub fn start_if_asked<R: Runtime>(app: &AppHandle<R>, folder: &Path, wrapper: AndroidKeystore<R>) {
    let trigger = folder.join(TRIGGER);
    if !trigger.exists() {
        return;
    }
    let result = folder.join(RESULT);
    let app = app.clone();
    std::thread::spawn(move || run(&app, &trigger, &result, &wrapper));
}

fn run<R: Runtime>(
    app: &AppHandle<R>,
    trigger: &Path,
    result: &Path,
    wrapper: &AndroidKeystore<R>,
) {
    // Removed first, so a check that hangs or crashes doesn't run again on
    // the next start.
    if let Err(error) = std::fs::remove_file(trigger) {
        record(result, &format!("failed: can't remove {TRIGGER}: {error}"));
        return;
    }
    let outcome = check_wrapper_contract(wrapper)
        .map_err(|case| format!("wrapper: {case}"))
        .and_then(|()| {
            check_store_contract(app.state::<DeviceKeys<R>>().inner())
                .map_err(|case| format!("store: {case}"))
        });
    match outcome {
        Ok(()) => record(result, "ok"),
        Err(case) => record(result, &format!("failed: {case}")),
    }
}

fn record(result: &Path, text: &str) {
    halonic_shell_log::record("device-key-check", text);
    if let Err(error) = std::fs::write(result, format!("{text}\n")) {
        halonic_shell_log::record("device-key-check", format!("can't write {RESULT}: {error}"));
    }
}
