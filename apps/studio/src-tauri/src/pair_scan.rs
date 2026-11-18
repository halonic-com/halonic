//! The phone's pairing scanner (HAL-12246, build plan decisions 14 and 16
//! on HAL-12232): the official Tauri barcode-scanner plugin, approved in
//! board decision 4c. The shell loads only the plugin's Kotlin side and
//! calls it from Rust, with fixed options, so no page can open the camera
//! its own way. The connect page gets two commands, on Android only
//! (`capabilities/phone-pair-scan.json`):
//!
//! - `pair_scan` asks for the camera when Android hasn't granted it, opens
//!   the back camera behind the page, which draws the scanner screen over
//!   it, and waits for one code. Only a pairing code's text reaches the page
//!   (`halonic_connect::read_scanned`), which decodes it with
//!   `decodePairingQr`. The shell opens, calls and looks up nothing from it.
//! - `pair_scan_cancel` closes the camera; a waiting `pair_scan` answers
//!   `closed`.
//!
//! The camera is on only while the scanner is open. The plugin closes it
//! when it has read a code or is cancelled, CameraX pauses it while the app
//! is in the background, and the shell cancels an open scan whenever the
//! window starts loading a page or closes ([`end_page_scan`]), so leaving or
//! reloading the page never leaves it on.

use halonic_connect::ScanAnswer;
use tauri::{AppHandle, Runtime};

/// Opens the scanner and waits for one code.
#[tauri::command]
pub async fn pair_scan<R: Runtime>(app: AppHandle<R>) -> ScanAnswer {
    scan(&app).await
}

/// Closes the scanner, if it is open.
#[tauri::command]
pub async fn pair_scan_cancel<R: Runtime>(app: AppHandle<R>) {
    cancel(&app).await;
}

#[cfg(target_os = "android")]
mod android {
    use std::sync::atomic::{AtomicBool, Ordering};

    use halonic_connect::{CameraPermission, QR_CODE_FORMAT, ScanAnswer, read_scanned};
    use serde::{Deserialize, Serialize};
    use tauri::plugin::{PluginHandle, TauriPlugin};
    use tauri::{AppHandle, Manager, Runtime};

    /// The plugin's Kotlin side, and whether a scan is open.
    pub struct Scanner<R: Runtime> {
        plugin: PluginHandle<R>,
        open: AtomicBool,
    }

    /// The plugin's answer to `checkPermissions` and `requestPermissions`.
    #[derive(Deserialize)]
    struct Permissions {
        camera: String,
    }

    /// The plugin's scan options: QR codes only, the back camera, and the
    /// camera behind the page (`windowed`), so the page draws the screen.
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ScanOptions {
        formats: [&'static str; 1],
        windowed: bool,
        camera_direction: &'static str,
    }

    /// What the plugin read.
    #[derive(Deserialize)]
    struct Scanned {
        content: String,
        format: Option<String>,
    }

    /// Loads the Kotlin side, which only Android has, under the shell's own
    /// plugin name. The barcode-scanner plugin itself is never registered,
    /// and no capability grants a `pair-scanner` command, so a page reaches
    /// the Kotlin side only through `pair_scan` and `pair_scan_cancel`.
    pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
        tauri::plugin::Builder::new("pair-scanner")
            .setup(|app, api| {
                let plugin = api
                    .register_android_plugin("app.tauri.barcodescanner", "BarcodeScannerPlugin")?;
                app.manage(Scanner {
                    plugin,
                    open: AtomicBool::new(false),
                });
                Ok(())
            })
            .build()
    }

    pub async fn scan<R: Runtime>(app: &AppHandle<R>) -> ScanAnswer {
        let Some(scanner) = app.try_state::<Scanner<R>>() else {
            return ScanAnswer::Closed;
        };
        if scanner.camera("checkPermissions").await != CameraPermission::Granted
            && scanner.camera("requestPermissions").await != CameraPermission::Granted
        {
            // A refused request always reads `denied`; asking again tells
            // whether Android will show its question next time.
            return scanner.camera("checkPermissions").await.turned_down();
        }
        // One scan at a time: the plugin answers only the latest.
        if scanner.open.swap(true, Ordering::SeqCst) {
            return ScanAnswer::Closed;
        }
        let options = ScanOptions {
            formats: [QR_CODE_FORMAT],
            windowed: true,
            camera_direction: "back",
        };
        let answer = match scanner
            .plugin
            .run_mobile_plugin_async::<Scanned>("scan", options)
            .await
        {
            Ok(scanned) => read_scanned(scanned.format.as_deref(), &scanned.content),
            Err(_) => ScanAnswer::Closed,
        };
        scanner.open.store(false, Ordering::SeqCst);
        answer
    }

    pub async fn cancel<R: Runtime>(app: &AppHandle<R>) {
        let Some(scanner) = app.try_state::<Scanner<R>>() else {
            return;
        };
        if scanner.open.load(Ordering::SeqCst) {
            // The scan's own answer clears `open` once the plugin has
            // closed the camera and answered it.
            let _ = scanner
                .plugin
                .run_mobile_plugin_async::<()>("cancel", ())
                .await;
        }
    }

    impl<R: Runtime> Scanner<R> {
        /// The camera permission after `command`, `checkPermissions` or
        /// `requestPermissions`. A plugin that fails reads as `Denied`.
        async fn camera(&self, command: &str) -> CameraPermission {
            match self
                .plugin
                .run_mobile_plugin_async::<Permissions>(command, ())
                .await
            {
                Ok(permissions) => CameraPermission::from_state(&permissions.camera),
                Err(_) => CameraPermission::Denied,
            }
        }
    }
}

/// Closes the scanner when the window starts loading a page or closes, so
/// a page that left without cancelling never leaves the camera on.
pub fn end_page_scan<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(target_os = "android")]
    {
        let app = app.clone();
        tauri::async_runtime::spawn(async move { cancel(&app).await });
    }
    #[cfg(not(target_os = "android"))]
    let _ = app;
}

#[cfg(target_os = "android")]
pub use android::plugin;
#[cfg(target_os = "android")]
use android::{cancel, scan};

/// Other platforms have no scanner.
#[cfg(not(target_os = "android"))]
async fn scan<R: Runtime>(_app: &AppHandle<R>) -> ScanAnswer {
    ScanAnswer::NoScanner
}

#[cfg(not(target_os = "android"))]
async fn cancel<R: Runtime>(_app: &AppHandle<R>) {}
