//! How the page starts a pairing, checked again on this side: the page is
//! the app's own, but what it hands over still comes from a QR code or
//! the keyboard.

use halonic_blob_store::base64url;
use halonic_device_keys::{ComputerId, MAX_ENDPOINTS};
use halonic_tunnel::{Endpoint, KEY_BYTES, PairingCode, PairingRoute};
use serde::Deserialize;

use crate::answers::Problem;
use crate::status::Reason;

/// A pairing as the page starts it, with `route` as the tag. No `Debug`,
/// so the code never reaches a log line.
#[derive(Deserialize)]
#[serde(
    tag = "route",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum PairingStart {
    /// From a scanned QR code, as the page read it with `decodePairingQr`.
    Qr {
        /// The computer's static key, base64url without padding. The
        /// computer's message 2 must carry this key.
        host_key: String,
        code: String,
        endpoints: Vec<String>,
        /// The computer the person chose Pair again on.
        #[serde(default)]
        again: Option<String>,
    },
    /// From a typed code, for the computer the person picked.
    Typed {
        code: String,
        endpoints: Vec<String>,
        #[serde(default)]
        again: Option<String>,
    },
}

/// A start whose parts all read.
#[derive(Debug)]
pub struct CheckedStart {
    pub code: PairingCode,
    pub route: PairingRoute,
    /// The endpoints that read, in the page's order.
    pub endpoints: Vec<Endpoint>,
    /// The listed computer to pair again, when the page named one by a
    /// valid id.
    pub again: Option<ComputerId>,
}

impl PairingStart {
    /// Reads the code, the QR code's key and the endpoints. An endpoint
    /// that doesn't read is left out, and none left is "can't reach"; a
    /// code or key that doesn't read is unreadable. The page's copy of the
    /// code is overwritten here, best effort: the IPC's own buffers can't
    /// be.
    pub fn check(self) -> Result<CheckedStart, Problem> {
        let (host_key, code, endpoints, again) = match self {
            Self::Qr {
                host_key,
                code,
                endpoints,
                again,
            } => (Some(host_key), code, endpoints, again),
            Self::Typed {
                code,
                endpoints,
                again,
            } => (None, code, endpoints, again),
        };
        let parsed = PairingCode::parse(&code);
        wipe(code);
        let code = parsed.ok_or(Problem::Unreadable)?;
        let route = match host_key {
            Some(text) => PairingRoute::Qr {
                host_key: read_key(&text).ok_or(Problem::Unreadable)?,
            },
            None => PairingRoute::Typed,
        };
        let endpoints = read_endpoints(&endpoints);
        if endpoints.is_empty() {
            return Err(Problem::CantReach {
                reason: Reason::Unreachable,
            });
        }
        let again = again.and_then(|id| ComputerId::parse(&id).ok());
        Ok(CheckedStart {
            code,
            route,
            endpoints,
            again,
        })
    }
}

fn read_key(text: &str) -> Option<[u8; KEY_BYTES]> {
    base64url::decode(text)?.try_into().ok()
}

/// The endpoints that read, at most [`MAX_ENDPOINTS`] of them.
fn read_endpoints(endpoints: &[String]) -> Vec<Endpoint> {
    endpoints
        .iter()
        .filter_map(|endpoint| Endpoint::parse(endpoint))
        .take(MAX_ENDPOINTS)
        .collect()
}

/// Overwrites text that held the pairing code, as the shell's
/// `device_keys` module does for key text.
fn wipe(text: String) {
    let mut bytes = text.into_bytes();
    bytes.fill(0);
    std::hint::black_box(&mut bytes);
}
