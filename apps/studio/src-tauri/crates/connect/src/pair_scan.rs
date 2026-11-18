//! What the phone's pairing scanner hands the page (HAL-12246, build plan
//! decisions 14 and 16 on HAL-12232). The shell drives the official Tauri
//! barcode-scanner plugin from Rust and turns each step into a
//! [`ScanAnswer`]. The page reads the text with `decodePairingQr` from
//! `@halonicjs/ports`, which refuses an unknown version.
//!
//! A scanned value is only ever text for that codec: the shell opens no
//! link, makes no call and looks nothing up from it. Anything that isn't a
//! QR code starting with [`PAIRING_QR_PREFIX`], within
//! [`PAIRING_QR_MAX_BYTES`], doesn't reach the page at all.

use serde::Serialize;

/// The text every pairing QR code starts with: `pairingQrPrefix` in
/// `packages/core/ports/src/pairing-codes.ts`.
pub const PAIRING_QR_PREFIX: &str = "halonic-pair:";

/// The longest pairing QR text, in bytes: `pairingQrMaxBytes` in
/// `packages/core/ports/src/pairing-codes.ts`.
pub const PAIRING_QR_MAX_BYTES: usize = 150;

/// The plugin's name for a QR code, the only format the scanner asks for.
pub const QR_CODE_FORMAT: &str = "QR_CODE";

/// One outcome of opening the scanner, shaped like the page's `ScanAnswer`.
/// The page owns the words.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ScanAnswer {
    /// A QR code that may be a pairing code: the page decodes `text`.
    Scanned { text: String },
    /// A code that isn't a pairing code: another format, another prefix,
    /// or too long.
    NotAPairingCode,
    /// The scanner closed without a code: the page cancelled it, the window
    /// left the page, or the camera failed.
    Closed,
    /// The person turned the camera down. `ask_again` says whether Android
    /// will show its question on the next try; when it won't, only the
    /// phone's Settings can turn the camera on.
    NoCamera { ask_again: bool },
    /// This build has no scanner: the shell on desktop.
    NoScanner,
}

/// The camera permission, as the plugin reports it (Tauri's
/// `PermissionState`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CameraPermission {
    Granted,
    /// Not asked yet, or turned down once: Android will ask.
    Ask,
    /// Turned down for good, or a state the shell doesn't know.
    Denied,
}

impl CameraPermission {
    /// Reads the plugin's `camera` state: `granted`, `prompt`,
    /// `prompt-with-rationale` or `denied`. Anything else is `Denied`, so an
    /// unknown answer never opens the camera.
    pub fn from_state(state: &str) -> Self {
        match state {
            "granted" => Self::Granted,
            "prompt" | "prompt-with-rationale" => Self::Ask,
            _ => Self::Denied,
        }
    }

    /// The answer when the camera is still not granted after Android's
    /// question: whether Android will ask on the next try.
    pub fn turned_down(self) -> ScanAnswer {
        ScanAnswer::NoCamera {
            ask_again: self == Self::Ask,
        }
    }
}

/// What the scanner read: only a QR code whose text starts with the pairing
/// prefix and is at most [`PAIRING_QR_MAX_BYTES`] long is handed on.
pub fn read_scanned(format: Option<&str>, content: &str) -> ScanAnswer {
    let is_qr = format == Some(QR_CODE_FORMAT);
    let fits = content.len() <= PAIRING_QR_MAX_BYTES;
    if is_qr && fits && content.starts_with(PAIRING_QR_PREFIX) {
        ScanAnswer::Scanned {
            text: content.to_owned(),
        }
    } else {
        ScanAnswer::NotAPairingCode
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const PAIRING_TEXT: &str = "halonic-pair:AQ";

    #[test]
    fn a_pairing_qr_code_is_handed_on_as_text() {
        assert_eq!(
            read_scanned(Some("QR_CODE"), PAIRING_TEXT),
            ScanAnswer::Scanned {
                text: PAIRING_TEXT.to_owned()
            }
        );
        let longest = format!("{PAIRING_QR_PREFIX}{}", "A".repeat(137));
        assert_eq!(longest.len(), PAIRING_QR_MAX_BYTES);
        assert!(matches!(
            read_scanned(Some("QR_CODE"), &longest),
            ScanAnswer::Scanned { .. }
        ));
    }

    #[test]
    fn anything_else_scanned_is_not_a_pairing_code() {
        let too_long = format!("{PAIRING_QR_PREFIX}{}", "A".repeat(138));
        for (format, content) in [
            (Some("QR_CODE"), "https://example.com/halonic-pair:AQ"),
            (Some("QR_CODE"), "HALONIC-PAIR:AQ"),
            (Some("QR_CODE"), " halonic-pair:AQ"),
            (Some("QR_CODE"), ""),
            (Some("QR_CODE"), too_long.as_str()),
            (Some("DATA_MATRIX"), PAIRING_TEXT),
            (Some("EAN_13"), "4006381333931"),
            (None, PAIRING_TEXT),
        ] {
            assert_eq!(
                read_scanned(format, content),
                ScanAnswer::NotAPairingCode,
                "{format:?} {content}"
            );
        }
    }

    #[test]
    fn the_camera_opens_only_when_granted() {
        assert_eq!(
            CameraPermission::from_state("granted"),
            CameraPermission::Granted
        );
        for state in ["prompt", "prompt-with-rationale"] {
            assert_eq!(CameraPermission::from_state(state), CameraPermission::Ask);
        }
        for state in ["denied", "", "Granted", "unknown"] {
            assert_eq!(
                CameraPermission::from_state(state),
                CameraPermission::Denied
            );
        }
    }

    #[test]
    fn a_turned_down_camera_says_whether_android_asks_again() {
        assert_eq!(
            CameraPermission::Ask.turned_down(),
            ScanAnswer::NoCamera { ask_again: true }
        );
        assert_eq!(
            CameraPermission::Denied.turned_down(),
            ScanAnswer::NoCamera { ask_again: false }
        );
    }

    #[test]
    fn answers_have_the_page_s_shape() {
        let answers = [
            (
                ScanAnswer::Scanned {
                    text: PAIRING_TEXT.to_owned(),
                },
                json!({"kind": "scanned", "text": PAIRING_TEXT}),
            ),
            (
                ScanAnswer::NotAPairingCode,
                json!({"kind": "notAPairingCode"}),
            ),
            (ScanAnswer::Closed, json!({"kind": "closed"})),
            (
                ScanAnswer::NoCamera { ask_again: true },
                json!({"kind": "noCamera", "askAgain": true}),
            ),
            (ScanAnswer::NoScanner, json!({"kind": "noScanner"})),
        ];
        for (answer, shape) in answers {
            assert_eq!(serde_json::to_value(&answer).expect("JSON"), shape);
        }
    }
}
