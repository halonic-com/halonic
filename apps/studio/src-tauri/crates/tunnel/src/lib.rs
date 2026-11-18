//! The phone's end of the end-to-end session with the computer's remote
//! gateway (tunnel phase B, task HAL-12244; ADR "Pairing and the end-to-end
//! session"). The rules and constants come from `remote-gateway-session.ts`
//! and `pairing-codes.ts` in `@halonicjs/ports`, and the tests check this
//! crate against the same test vectors.
//!
//! This crate holds no Tauri types. It grows in small steps: the codes and
//! the frames first, then the Noise handshakes with `snow`, then the
//! WebSocket transport.

mod backoff;
mod codes;
mod connect;
mod endpoint;
mod frames;
mod transport;

pub use backoff::Backoff;
pub use codes::{
    CHECK_CODE_INFO, CHECK_CODE_INPUT_BYTES, CHECK_CODE_LENGTH, CheckCode, PAIR_COMMIT_LABEL,
    PAIRING_ALPHABET, PAIRING_CODE_LENGTH, PAIRING_PSK_INFO, PairingCode, check_code,
    check_code_from_bytes, pair_commit,
};
pub use connect::{CONNECT_TIMEOUT, ConnectError, Dialer};
pub use endpoint::{Endpoint, GATEWAY_PATH};
pub use frames::{
    FrameKind, MAX_FRAME_BYTES, MAX_HANDSHAKE_BYTES, MAX_NAME_BYTES, NOISE_MAX_MESSAGE_BYTES,
    PairRefusedReason, Refusal, frame, read_frame, read_refusal,
};
pub use transport::{SendError, Transport, TransportEvent, TransportState};
