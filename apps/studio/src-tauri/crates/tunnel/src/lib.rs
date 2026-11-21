//! The phone's end of the end-to-end session with the computer's remote
//! gateway (tunnel phase B, task HAL-12244; ADR "Pairing and the end-to-end
//! session"). The rules and constants come from `remote-gateway-session.ts`
//! and `pairing-codes.ts` in `@halonicjs/ports`, and the tests check this
//! crate against the same test vectors.
//!
//! This crate holds no Tauri types. The handshakes and the session take
//! frames in and give frames out, and `snow` does every Noise step; the
//! WebSocket transport carries those frames to the gateway.

mod backoff;
mod codes;
mod connect;
mod endpoint;
mod error;
mod frames;
mod handshake;
mod keys;
mod pairing_run;
mod phone;
mod session;
mod transport;

pub use backoff::Backoff;
pub use codes::{
    CHECK_CODE_INFO, CHECK_CODE_INPUT_BYTES, CHECK_CODE_LENGTH, CheckCode, PAIR_COMMIT_LABEL,
    PAIRING_ALPHABET, PAIRING_CODE_LENGTH, PAIRING_PSK_INFO, PairingCode, check_code,
    check_code_from_bytes, pair_commit,
};
pub use connect::{CONNECT_TIMEOUT, ConnectError, Dialer};
pub use endpoint::{Endpoint, GATEWAY_PATH};
pub use error::SessionError;
pub use frames::{
    FrameKind, MAX_FRAME_BYTES, MAX_HANDSHAKE_BYTES, MAX_NAME_BYTES, NOISE_MAX_MESSAGE_BYTES,
    PairRefusedReason, Refusal, frame, read_frame, read_refusal,
};
pub use handshake::{
    PAIR_COMMIT_NONCE_BYTES, PAIRING_PATTERN, PROLOGUE, Pairing, PairingCheck, PairingRoute,
    PhoneDetails, Platform, RECONNECT_PATTERN, Reconnect,
};
pub use keys::{KEY_BYTES, PhoneKeys};
pub use pairing_run::{
    ALLOW_TIMEOUT, Paired, PairingAtCheck, PairingOptions, PairingProblem, PairingRequest,
    start_pairing,
};
pub use phone::{
    HANDSHAKE_TIMEOUT, PairedComputer, PhoneConnection, PhoneEvent, PhoneOptions, PhoneStatus,
};
pub use session::{MAX_MESSAGE_BYTES, Opened, REKEY_AFTER, REKEY_AFTER_MESSAGES, Session};
pub use transport::{ConnectionId, SendError, Timeouts, Transport, TransportEvent, TransportState};
