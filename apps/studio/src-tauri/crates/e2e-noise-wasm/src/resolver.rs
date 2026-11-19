//! Where `snow` gets its primitives: X25519, ChaChaPoly and SHA-256 from its
//! default resolver, and randomness from the host. There is no other source
//! of randomness, so one that fails fails the handshake rather than falling
//! back to anything weaker (Julian's condition 5 on HAL-12355).

use std::sync::Mutex;

use snow::params::{CipherChoice, DHChoice, HashChoice};
use snow::resolvers::{CryptoResolver, DefaultResolver};
use snow::types::{Cipher, Dh, Hash, Random};

/// The host's source of random bytes. In WebAssembly it is the imported
/// function; tests pass their own.
pub trait RandomSource: Send + Sync {
    /// Fills `dest` entirely, or returns `false` when it can't.
    fn fill(&mut self, dest: &mut [u8]) -> bool;
}

/// The resolver for one session. `snow` asks it for a random source once,
/// when the handshake is built.
pub(crate) struct HostResolver {
    random: Mutex<Option<Box<dyn RandomSource>>>,
}

impl HostResolver {
    pub(crate) fn new(random: Box<dyn RandomSource>) -> Self {
        HostResolver {
            random: Mutex::new(Some(random)),
        }
    }
}

impl CryptoResolver for HostResolver {
    fn resolve_rng(&self) -> Option<Box<dyn Random>> {
        let source = self.random.lock().ok()?.take()?;
        Some(Box::new(HostRandom(source)))
    }

    fn resolve_dh(&self, choice: &DHChoice) -> Option<Box<dyn Dh>> {
        DefaultResolver.resolve_dh(choice)
    }

    fn resolve_hash(&self, choice: &HashChoice) -> Option<Box<dyn Hash>> {
        DefaultResolver.resolve_hash(choice)
    }

    fn resolve_cipher(&self, choice: &CipherChoice) -> Option<Box<dyn Cipher>> {
        DefaultResolver.resolve_cipher(choice)
    }
}

struct HostRandom(Box<dyn RandomSource>);

impl Random for HostRandom {
    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), snow::Error> {
        if self.0.fill(dest) {
            Ok(())
        } else {
            Err(snow::Error::Rng)
        }
    }
}
