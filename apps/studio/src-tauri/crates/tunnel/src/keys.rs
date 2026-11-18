//! The phone's static X25519 key pair, which the host knows it by. Made and
//! used here; kept wrapped by the platform's key store behind the
//! `DeviceKeyStore` port (build plan decision 10), which is not this crate's.

use std::fmt;

use snow::params::DHChoice;
use snow::resolvers::{CryptoResolver, DefaultResolver};

use crate::error::SessionError;

/// The length of an X25519 key, private or public.
pub const KEY_BYTES: usize = 32;

/// The phone's static key pair. Its `Debug` form shows the public key only.
#[derive(Clone)]
pub struct PhoneKeys {
    private: [u8; KEY_BYTES],
    public: [u8; KEY_BYTES],
}

impl PhoneKeys {
    /// A new key pair from the system's secure random source.
    pub fn generate() -> Result<Self, SessionError> {
        let mut private = [0u8; KEY_BYTES];
        fill_random(&mut private)?;
        Self::from_private(private)
    }

    /// The key pair of a private key the key store gave back.
    pub fn from_private(private: [u8; KEY_BYTES]) -> Result<Self, SessionError> {
        let mut dh = DefaultResolver
            .resolve_dh(&DHChoice::Curve25519)
            .ok_or(SessionError::Crypto)?;
        dh.set(&private);
        let public = dh.pubkey().try_into().map_err(|_| SessionError::Crypto)?;
        Ok(Self { private, public })
    }

    /// The private key, for the key store to wrap and for the handshakes.
    pub fn private(&self) -> &[u8; KEY_BYTES] {
        &self.private
    }

    /// The public key, which the host keeps for the phone.
    pub fn public(&self) -> &[u8; KEY_BYTES] {
        &self.public
    }
}

impl fmt::Debug for PhoneKeys {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PhoneKeys")
            .field("public", &self.public)
            .finish_non_exhaustive()
    }
}

/// Fills `bytes` from the system's secure random source, through `snow`.
pub(crate) fn fill_random(bytes: &mut [u8]) -> Result<(), SessionError> {
    DefaultResolver
        .resolve_rng()
        .ok_or(SessionError::Crypto)?
        .try_fill_bytes(bytes)
        .map_err(|_| SessionError::Crypto)
}
