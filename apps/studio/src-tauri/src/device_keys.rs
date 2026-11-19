//! The phone's key store (HAL-12245, build plan decision 10 on HAL-12232):
//! the Android adapter of `halonic-device-keys`. Each paired computer's key
//! pair is a file in the app's private data, sealed by an AES-256-GCM key
//! in the Android Keystore (StrongBox when the phone has one) through the
//! Kotlin `DeviceKeyPlugin`. The shell keeps the store as state; the phone
//! transport loads and saves through it, and forgets a computer's key on
//! Removed and on Forget.
//!
//! No capability grants the plugin's commands, so no page can call them;
//! only the shell does, from Rust. A call waits for the Kotlin side, so it
//! must not run on Android's main thread.
//!
//! The pair crosses to Kotlin and back as base64url JSON text. The shell
//! wipes the copies it owns; the JSON and the JVM's strings it can't, and
//! they stay in the app's own memory until they are reused.
//!
//! A debug build can also run the store and wrapper contracts against the
//! real Keystore (`device_key_check`, HAL-13784).

use halonic_blob_store::base64url;
use halonic_device_keys::{DeviceKeyError, KeyWrapper, WrappedFileStore};
use serde::{Deserialize, Serialize};
use tauri::plugin::{PluginHandle, TauriPlugin};
use tauri::{Manager, Runtime};

/// The folder in the app's data that holds the sealed keys.
const FOLDER: &str = "device-keys";

/// The phone's key store, as the shell keeps it.
pub type DeviceKeys<R> = WrappedFileStore<AndroidKeystore<R>>;

/// The Android Keystore, as a [`KeyWrapper`].
pub struct AndroidKeystore<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct SealRequest {
    plain: String,
    context: String,
}

#[derive(Deserialize)]
struct Sealed {
    sealed: String,
}

#[derive(Serialize)]
struct OpenRequest {
    sealed: String,
    context: String,
}

/// The Kotlin side's answer to an open: no `plain` when the bytes don't
/// open, because they were changed or sealed for another computer, or the
/// Keystore key is gone.
#[derive(Deserialize)]
struct Opened {
    plain: Option<String>,
}

impl<R: Runtime> KeyWrapper for AndroidKeystore<R> {
    fn seal(&self, plain: &[u8], context: &[u8]) -> Result<Vec<u8>, DeviceKeyError> {
        let request = SealRequest {
            plain: base64url::encode(plain),
            context: base64url::encode(context),
        };
        let answer = self
            .0
            .run_mobile_plugin::<Sealed>("sealDeviceKey", &request);
        wipe_text(request.plain);
        let answer = answer.map_err(|_| DeviceKeyError::Unavailable)?;
        base64url::decode(&answer.sealed).ok_or(DeviceKeyError::Unavailable)
    }

    fn open(&self, sealed: &[u8], context: &[u8]) -> Result<Vec<u8>, DeviceKeyError> {
        let request = OpenRequest {
            sealed: base64url::encode(sealed),
            context: base64url::encode(context),
        };
        let answer = self
            .0
            .run_mobile_plugin::<Opened>("openDeviceKey", &request)
            .map_err(|_| DeviceKeyError::Unavailable)?;
        let Some(text) = answer.plain else {
            return Err(DeviceKeyError::Unreadable);
        };
        let plain = base64url::decode(&text);
        wipe_text(text);
        plain.ok_or(DeviceKeyError::Unavailable)
    }
}

/// Overwrites text that held key material, best effort as in
/// `halonic-device-keys`.
fn wipe_text(text: String) {
    let mut bytes = text.into_bytes();
    bytes.fill(0);
    std::hint::black_box(&mut bytes);
}

/// Loads the Kotlin side, which only Android has, and keeps the store as
/// the shell's state.
pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("device-keys")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.halonic.studio", "DeviceKeyPlugin")?;
            let data = app.path().app_data_dir()?;
            #[cfg(debug_assertions)]
            let check_wrapper = AndroidKeystore(handle.clone());
            let store = WrappedFileStore::new(data.join(FOLDER), AndroidKeystore(handle));
            app.manage::<DeviceKeys<R>>(store);
            #[cfg(debug_assertions)]
            crate::device_key_check::start_if_asked(app, &data, check_wrapper);
            Ok(())
        })
        .build()
}
