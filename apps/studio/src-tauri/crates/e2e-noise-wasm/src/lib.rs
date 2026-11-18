//! The agent host's end of a Noise session (requirement
//! `ports.remote-gateway-session`, ADR "Pairing and the end-to-end session").
//! It is `snow`, the library the phone uses, behind a [`Session`] that knows
//! only our two handshakes, so both ends run the same Noise code. We write
//! no crypto here.
//!
//! The crate is built to WebAssembly for `@halonicjs/adapter-e2e-noise`
//! (B1, HAL-12236). The host makes one WebAssembly instance per connection
//! and wipes its memory when the session ends, which reaches every copy of
//! a key `snow` leaves behind. `src/exports.rs` holds the functions it calls.
//! Natively, the crate is a plain library, so its tests run with the rest of
//! the workspace.
//!
//! A session that fails once stays failed: after any error, from `snow` or
//! from our own checks, every call fails and nothing is retried.

#[cfg(target_arch = "wasm32")]
mod exports;
mod resolver;

use snow::{Builder, HandshakeState, TransportState};

use resolver::HostResolver;
pub use resolver::RandomSource;

/// The largest Noise message, handshake or transport, by the Noise spec.
pub const MAX_MESSAGE_BYTES: usize = 65_535;

/// The bytes a transport message adds to its payload: the ChaChaPoly tag.
pub const TAG_BYTES: usize = 16;

/// The length of an X25519 key, a psk and a SHA-256 handshake hash.
pub const KEY_BYTES: usize = 32;

/// Our two handshakes, as `@halonicjs/ports` names them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Handshake {
    /// `gatewayPairingPattern`: pairs a new phone with the code as the psk.
    Pairing,
    /// `gatewayReconnectPattern`: a paired phone reconnects to the key it pinned.
    Reconnect,
}

impl Handshake {
    /// The Noise protocol name `snow` parses.
    pub fn protocol_name(self) -> &'static str {
        match self {
            Handshake::Pairing => "Noise_XXpsk3_25519_ChaChaPoly_SHA256",
            Handshake::Reconnect => "Noise_IK_25519_ChaChaPoly_SHA256",
        }
    }
}

/// Which end of the handshake this session is. The phone starts both handshakes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Initiator,
    Responder,
}

/// What a session starts with. `psk` is required for pairing and refused for
/// reconnect; `remote_public` is required for a reconnect initiator and
/// refused everywhere else.
pub struct SessionKeys<'a> {
    pub local_private: &'a [u8; KEY_BYTES],
    pub remote_public: Option<&'a [u8; KEY_BYTES]>,
    pub psk: Option<&'a [u8; KEY_BYTES]>,
    pub prologue: &'a [u8],
}

/// Why a call failed. The session is failed from then on, whatever the reason.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Failure {
    /// The keys don't fit the handshake and role.
    Keys,
    /// A call that the session's state doesn't allow, or a call after a failure.
    State,
    /// A message or payload larger than Noise allows, or than the output holds.
    Size,
    /// `snow` refused: a message that doesn't decrypt or isn't well formed, a
    /// bad key, or no randomness.
    Noise,
}

enum State {
    Handshake(Box<HandshakeState>),
    Transport {
        transport: Box<TransportState>,
        handshake_hash: [u8; KEY_BYTES],
    },
    Failed,
}

/// One Noise session: a handshake and then the transport messages after it.
pub struct Session {
    state: State,
}

impl Session {
    /// Starts a handshake. `random` gives the ephemeral key's bytes.
    pub fn start(
        handshake: Handshake,
        role: Role,
        keys: &SessionKeys<'_>,
        random: Box<dyn RandomSource>,
    ) -> Result<Session, Failure> {
        let expects_remote = handshake == Handshake::Reconnect && role == Role::Initiator;
        let expects_psk = handshake == Handshake::Pairing;
        if keys.remote_public.is_some() != expects_remote || keys.psk.is_some() != expects_psk {
            return Err(Failure::Keys);
        }
        let params = handshake
            .protocol_name()
            .parse()
            .map_err(|_| Failure::Noise)?;
        let mut builder = Builder::with_resolver(params, Box::new(HostResolver::new(random)))
            .local_private_key(keys.local_private)
            .and_then(|builder| builder.prologue(keys.prologue))
            .map_err(|_| Failure::Keys)?;
        if let Some(remote) = keys.remote_public {
            builder = builder
                .remote_public_key(remote)
                .map_err(|_| Failure::Keys)?;
        }
        if let Some(psk) = keys.psk {
            builder = builder.psk(3, psk).map_err(|_| Failure::Keys)?;
        }
        let state = match role {
            Role::Initiator => builder.build_initiator(),
            Role::Responder => builder.build_responder(),
        }
        .map_err(|_| Failure::Noise)?;
        Ok(Session {
            state: State::Handshake(Box::new(state)),
        })
    }

    /// Writes the next message: a handshake message while the handshake runs,
    /// then a transport message. Returns the message's length in `out`.
    pub fn write(&mut self, payload: &[u8], out: &mut [u8]) -> Result<usize, Failure> {
        self.guard(|state| {
            let written = match state {
                State::Handshake(handshake) if handshake.is_my_turn() => {
                    handshake.write_message(payload, out)
                }
                State::Transport { transport, .. } => {
                    if payload.len() + TAG_BYTES > MAX_MESSAGE_BYTES.min(out.len()) {
                        return Err(Failure::Size);
                    }
                    transport.write_message(payload, out)
                }
                _ => return Err(Failure::State),
            };
            written.map_err(|_| Failure::Noise)
        })
    }

    /// Reads the next message and returns its payload's length in `out`.
    pub fn read(&mut self, message: &[u8], out: &mut [u8]) -> Result<usize, Failure> {
        self.guard(|state| {
            if message.len() > MAX_MESSAGE_BYTES {
                return Err(Failure::Size);
            }
            let read = match state {
                State::Handshake(handshake) if !handshake.is_my_turn() => {
                    handshake.read_message(message, out)
                }
                State::Transport { transport, .. } => transport.read_message(message, out),
                _ => return Err(Failure::State),
            };
            read.map_err(|_| Failure::Noise)
        })
    }

    /// Whether the handshake is over and transport messages can flow.
    pub fn is_transport(&self) -> bool {
        matches!(self.state, State::Transport { .. })
    }

    /// The handshake hash, once the handshake is over.
    pub fn handshake_hash(&self) -> Result<[u8; KEY_BYTES], Failure> {
        match &self.state {
            State::Transport { handshake_hash, .. } => Ok(*handshake_hash),
            _ => Err(Failure::State),
        }
    }

    /// The other side's static key, once the handshake is over.
    pub fn remote_static(&self) -> Result<[u8; KEY_BYTES], Failure> {
        let State::Transport { transport, .. } = &self.state else {
            return Err(Failure::State);
        };
        let key = transport.get_remote_static().ok_or(Failure::State)?;
        key.try_into().map_err(|_| Failure::State)
    }

    /// Rekeys the sending direction, after sending a `rekey` frame.
    pub fn rekey_outgoing(&mut self) -> Result<(), Failure> {
        self.guard(|state| match state {
            State::Transport { transport, .. } => {
                transport.rekey_outgoing();
                Ok(())
            }
            _ => Err(Failure::State),
        })
    }

    /// Rekeys the receiving direction, after reading a `rekey` frame.
    pub fn rekey_incoming(&mut self) -> Result<(), Failure> {
        self.guard(|state| match state {
            State::Transport { transport, .. } => {
                transport.rekey_incoming();
                Ok(())
            }
            _ => Err(Failure::State),
        })
    }

    /// Runs one call: on success, moves a finished handshake to transport;
    /// on any failure, fails the session for good.
    fn guard<T>(
        &mut self,
        call: impl FnOnce(&mut State) -> Result<T, Failure>,
    ) -> Result<T, Failure> {
        let result = call(&mut self.state).and_then(|value| {
            self.finish_handshake()?;
            Ok(value)
        });
        if result.is_err() {
            self.state = State::Failed;
        }
        result
    }

    fn finish_handshake(&mut self) -> Result<(), Failure> {
        let finished =
            matches!(&self.state, State::Handshake(handshake) if handshake.is_handshake_finished());
        if !finished {
            return Ok(());
        }
        let State::Handshake(handshake) = std::mem::replace(&mut self.state, State::Failed) else {
            return Err(Failure::State);
        };
        let handshake_hash: [u8; KEY_BYTES] = handshake
            .get_handshake_hash()
            .try_into()
            .map_err(|_| Failure::Noise)?;
        let transport = (*handshake)
            .into_transport_mode()
            .map_err(|_| Failure::Noise)?;
        self.state = State::Transport {
            transport: Box::new(transport),
            handshake_hash,
        };
        Ok(())
    }
}
