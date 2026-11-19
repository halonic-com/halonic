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
//!
//! A cancel is never lost, however early it comes (HAL-12577): one during
//! the permission question stops the scan before the camera opens, and one
//! that reaches the plugin before the camera is bound is repeated until well
//! after, because the plugin binds the camera once CameraX is ready even
//! when it was cancelled in between (`halonic_connect::ScanSession`).

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
    use halonic_connect::{
        CANCEL_FOLLOW_UPS, CameraPermission, CancelPlan, QR_CODE_FORMAT, ScanAnswer, ScanId,
        ScanSession, read_scanned,
    };
    use serde::{Deserialize, Serialize};
    use tauri::plugin::{PluginHandle, TauriPlugin};
    use tauri::{AppHandle, Manager, Runtime};

    /// The plugin's Kotlin side, and the open scan with its cancels.
    pub struct Scanner<R: Runtime> {
        plugin: PluginHandle<R>,
        session: ScanSession,
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
                    session: ScanSession::default(),
                });
                Ok(())
            })
            .build()
    }

    pub async fn scan<R: Runtime>(app: &AppHandle<R>) -> ScanAnswer {
        let Some(scanner) = app.try_state::<Scanner<R>>() else {
            return ScanAnswer::Closed;
        };
        // One scan at a time: the plugin answers only the latest.
        let Some(id) = scanner.session.begin() else {
            return ScanAnswer::Closed;
        };
        let answer = scanner.scan(id).await;
        scanner.session.end(id);
        answer
    }

    pub async fn cancel<R: Runtime>(app: &AppHandle<R>) {
        let Some(scanner) = app.try_state::<Scanner<R>>() else {
            return;
        };
        // A scan still at the permission question stops there by itself.
        let CancelPlan::ClosePlugin(id) = scanner.session.cancel() else {
            return;
        };
        scanner.close().await;
        let app = app.clone();
        tauri::async_runtime::spawn(async move { follow_up(&app, id).await });
    }

    /// Cancels again after each of [`CANCEL_FOLLOW_UPS`], for a cancel that
    /// reached the plugin before it took the scan, or before CameraX bound
    /// the camera: the plugin binds it even then. Stops once a newer scan
    /// has begun.
    async fn follow_up<R: Runtime>(app: &AppHandle<R>, id: ScanId) {
        for wait in CANCEL_FOLLOW_UPS {
            let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(wait)).await;
            let Some(scanner) = app.try_state::<Scanner<R>>() else {
                return;
            };
            if !scanner.session.may_follow_up(id) {
                return;
            }
            scanner.close().await;
        }
    }

    impl<R: Runtime> Scanner<R> {
        /// Asks for the camera when Android hasn't granted it, then opens it
        /// unless the scan was cancelled meanwhile, and waits for one code.
        async fn scan(&self, id: ScanId) -> ScanAnswer {
            if self.camera("checkPermissions").await != CameraPermission::Granted
                && self.camera("requestPermissions").await != CameraPermission::Granted
            {
                // A refused request always reads `denied`; asking again
                // tells whether Android will show its question next time.
                return self.camera("checkPermissions").await.turned_down();
            }
            if !self.session.may_open_camera(id) {
                return ScanAnswer::Closed;
            }
            let options = ScanOptions {
                formats: [QR_CODE_FORMAT],
                windowed: true,
                camera_direction: "back",
            };
            match self
                .plugin
                .run_mobile_plugin_async::<Scanned>("scan", options)
                .await
            {
                Ok(scanned) => read_scanned(scanned.format.as_deref(), &scanned.content),
                Err(_) => ScanAnswer::Closed,
            }
        }

        /// Closes the camera, and answers a waiting scan `closed`.
        async fn close(&self) {
            let _ = self
                .plugin
                .run_mobile_plugin_async::<()>("cancel", ())
                .await;
        }

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
