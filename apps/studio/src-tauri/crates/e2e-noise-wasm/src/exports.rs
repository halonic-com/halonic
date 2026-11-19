//! The functions the host's WebAssembly instance exports, and the one it
//! imports. This is the only module with unsafe code: the `no_mangle`
//! exports and the imported random function (Julian's condition 3 on
//! HAL-12355).
//!
//! An instance holds at most one session, for one connection. The host
//! never passes a pointer: it writes its bytes into the input buffer, passes
//! their length, and reads results from the output buffer. Both buffers hold
//! one Noise message, and a length larger than that fails the session before
//! anything is copied. Every function returns a length, or -1 when the call
//! failed, and after one failure every call fails: the host then wipes and
//! drops the instance.
//!
//! The input for `noise_start` is the local private key, then the psk for
//! pairing, then the pinned host key for a reconnect from the phone, then the
//! prologue. Those bytes are zeroed in the input buffer once `snow` has them.

#![allow(unsafe_code)]

use std::cell::RefCell;

use crate::{
    Failure, Handshake, KEY_BYTES, MAX_MESSAGE_BYTES, RandomSource, Role, Session, SessionKeys,
};

#[link(wasm_import_module = "halonic")]
unsafe extern "C" {
    /// Fills `len` bytes at `dest` in this instance's memory with random
    /// bytes from the host, and returns 1. Anything else is a failure.
    safe fn random_fill(dest: *mut u8, len: usize) -> u32;
}

struct ImportedRandom;

impl RandomSource for ImportedRandom {
    fn fill(&mut self, dest: &mut [u8]) -> bool {
        random_fill(dest.as_mut_ptr(), dest.len()) == 1
    }
}

struct Instance {
    input: Box<[u8]>,
    output: Box<[u8]>,
    started: bool,
    session: Option<Session>,
}

thread_local! {
    static INSTANCE: RefCell<Instance> = RefCell::new(Instance {
        input: vec![0; MAX_MESSAGE_BYTES].into_boxed_slice(),
        output: vec![0; MAX_MESSAGE_BYTES].into_boxed_slice(),
        started: false,
        session: None,
    });
}

/// Runs one call on the instance. A failure drops the session, so every
/// later call fails too.
fn call(run: impl FnOnce(&mut Instance) -> Result<usize, Failure>) -> i32 {
    INSTANCE.with_borrow_mut(|instance| match run(instance) {
        Ok(length) => i32::try_from(length).unwrap_or(-1),
        Err(_) => {
            instance.session = None;
            -1
        }
    })
}

/// Runs one call on the instance's session.
fn with_session(run: impl FnOnce(&mut Session, &[u8], &mut [u8]) -> Result<usize, Failure>) -> i32 {
    call(|instance| {
        let session = instance.session.as_mut().ok_or(Failure::State)?;
        run(session, &instance.input, &mut instance.output)
    })
}

/// Checks a length the host passed against the input buffer.
fn input_length(length: u32) -> Result<usize, Failure> {
    usize::try_from(length)
        .ok()
        .filter(|&length| length <= MAX_MESSAGE_BYTES)
        .ok_or(Failure::Size)
}

/// Where the host writes its input.
#[unsafe(no_mangle)]
pub extern "C" fn noise_input() -> *mut u8 {
    INSTANCE.with_borrow_mut(|instance| instance.input.as_mut_ptr())
}

/// Where the host reads results.
#[unsafe(no_mangle)]
pub extern "C" fn noise_output() -> *const u8 {
    INSTANCE.with_borrow(|instance| instance.output.as_ptr())
}

/// The size of each buffer: one Noise message.
#[unsafe(no_mangle)]
pub extern "C" fn noise_buffer_bytes() -> u32 {
    MAX_MESSAGE_BYTES as u32
}

/// Starts this instance's session. `handshake` is 0 for pairing and 1 for
/// reconnect; `role` is 0 for the initiator and 1 for the responder.
#[unsafe(no_mangle)]
pub extern "C" fn noise_start(handshake: u32, role: u32, prologue_length: u32) -> i32 {
    call(|instance| {
        if instance.started {
            return Err(Failure::State);
        }
        instance.started = true;
        let session = start_session(handshake, role, prologue_length, &instance.input);
        // The keys are zeroed whether or not the session started.
        instance.input[..KEYS_AT_MOST].fill(0);
        instance.session = Some(session?);
        Ok(0)
    })
}

/// The most key bytes `noise_start` reads: a private key, and a psk or a public key.
const KEYS_AT_MOST: usize = 2 * KEY_BYTES;

fn start_session(
    handshake: u32,
    role: u32,
    prologue_length: u32,
    input: &[u8],
) -> Result<Session, Failure> {
    let handshake = match handshake {
        0 => Handshake::Pairing,
        1 => Handshake::Reconnect,
        _ => return Err(Failure::Keys),
    };
    let role = match role {
        0 => Role::Initiator,
        1 => Role::Responder,
        _ => return Err(Failure::Keys),
    };
    let has_psk = handshake == Handshake::Pairing;
    let has_remote = handshake == Handshake::Reconnect && role == Role::Initiator;
    let keys_length = KEY_BYTES * (1 + usize::from(has_psk || has_remote));
    let end = keys_length + input_length(prologue_length)?;
    let keys = SessionKeys {
        local_private: key_at(input, 0)?,
        psk: has_psk.then(|| key_at(input, 1)).transpose()?,
        remote_public: has_remote.then(|| key_at(input, 1)).transpose()?,
        prologue: input.get(keys_length..end).ok_or(Failure::Size)?,
    };
    Session::start(handshake, role, &keys, Box::new(ImportedRandom))
}

fn key_at(input: &[u8], index: usize) -> Result<&[u8; KEY_BYTES], Failure> {
    let start = index * KEY_BYTES;
    input[start..start + KEY_BYTES]
        .try_into()
        .map_err(|_| Failure::Size)
}

/// Writes the next message from a payload of `payload_length` input bytes.
/// Returns the message's length in the output.
#[unsafe(no_mangle)]
pub extern "C" fn noise_write(payload_length: u32) -> i32 {
    with_session(|session, input, output| {
        session.write(&input[..input_length(payload_length)?], output)
    })
}

/// Reads a message of `message_length` input bytes. Returns its payload's
/// length in the output.
#[unsafe(no_mangle)]
pub extern "C" fn noise_read(message_length: u32) -> i32 {
    with_session(|session, input, output| {
        session.read(&input[..input_length(message_length)?], output)
    })
}

/// 1 once the handshake is over, 0 before.
#[unsafe(no_mangle)]
pub extern "C" fn noise_is_transport() -> i32 {
    with_session(|session, _, _| Ok(usize::from(session.is_transport())))
}

/// Copies the handshake hash to the output, once the handshake is over.
#[unsafe(no_mangle)]
pub extern "C" fn noise_handshake_hash() -> i32 {
    with_session(|session, _, output| {
        output[..KEY_BYTES].copy_from_slice(&session.handshake_hash()?);
        Ok(KEY_BYTES)
    })
}

/// Copies the other side's static key to the output, once the handshake is over.
#[unsafe(no_mangle)]
pub extern "C" fn noise_remote_static() -> i32 {
    with_session(|session, _, output| {
        output[..KEY_BYTES].copy_from_slice(&session.remote_static()?);
        Ok(KEY_BYTES)
    })
}

/// Rekeys the sending direction.
#[unsafe(no_mangle)]
pub extern "C" fn noise_rekey_outgoing() -> i32 {
    with_session(|session, _, _| session.rekey_outgoing().map(|()| 0))
}

/// Rekeys the receiving direction.
#[unsafe(no_mangle)]
pub extern "C" fn noise_rekey_incoming() -> i32 {
    with_session(|session, _, _| session.rekey_incoming().map(|()| 0))
}
