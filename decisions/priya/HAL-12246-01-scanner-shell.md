# Decision: the phone's pairing scanner is the official plugin, driven from Rust only

- Approval: Paperclip task HAL-12246, from the tunnel phase B build plan on HAL-12232 (decision 16: the official Tauri barcode-scanner plugin, approved in board decision 4c); Julian, then Liam, review this PR as a security PR
- Kind: internal

The phone scans the pairing QR code with `tauri-plugin-barcode-scanner`, pinned to `=2.5.3` (it
needs tauri ^2.12, which we pin to 2.12.5), on Android only. Its Rust side has no API of its own,
and its permission set would let a page pick the camera, the formats and the layout. So the shell
never calls the plugin's `init`. It loads the plugin's Kotlin class under its own `pair-scanner`
name, as it already does for `local-network`, and calls it from Rust with fixed options: QR codes
only, the back camera, and the camera behind the page so the page draws the scanner screen. The
connect page gets two commands, `pair_scan` and `pair_scan_cancel`, on Android and from the local
page only. `served_page_tests.rs` checks that no page reaches the plugin's commands.

Rust hands the page only a QR code whose text starts with `halonic-pair:` and is at most 150
bytes. The page decodes it with `decodePairingQr`, which refuses an unknown version. Nothing opens,
calls or looks anything up from a scanned value. The plugin asks for `QR_CODE` but, through an
upstream slip, scans every format, so the format check in Rust matters.

The camera is on only while the scanner is open. The plugin closes it on a code or a cancel,
CameraX pauses it in the background, and the shell cancels an open scan whenever the window starts
loading a page or closes.

The manifest keeps the plugin's `CAMERA` permission, makes the camera feature optional so a phone
without one can still pair with the typed code, and drops `VIBRATE`, which nothing uses. On a phone
with no camera the plugin never answers a scan, so the scanner screen must always offer its close
button (D5).

The plugin reads codes with Google's ML Kit (`play-services-mlkit-barcode-scanning`), which runs
on the phone through Google Play services. The image never leaves the phone. ML Kit may send
Google usage statistics, as every app using it does; Julian confirms that is acceptable in the
review.

## Covers

- apps/studio/src-tauri/Cargo.toml
- apps/studio/src-tauri/capabilities/phone-pair-scan.json
