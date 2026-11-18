use std::fmt;

/// The length of an X25519 key, private or public, in bytes.
pub const KEY_BYTES: usize = 32;

/// The private half of a key pair. It is never printed, and its bytes are
/// overwritten with zeros when it is dropped.
///
/// The zeroing is best effort: the standard library can't promise that no
/// copy was left behind by a move, and the crate forbids `unsafe`, so it
/// can't use a volatile write. `black_box` keeps the compiler from dropping
/// the overwrite as a dead store.
pub struct PrivateKey([u8; KEY_BYTES]);

impl PrivateKey {
    /// Takes the key's bytes.
    pub fn new(bytes: [u8; KEY_BYTES]) -> Self {
        Self(bytes)
    }

    /// The key's bytes, for the Noise handshake.
    pub fn bytes(&self) -> &[u8; KEY_BYTES] {
        &self.0
    }
}

impl Drop for PrivateKey {
    fn drop(&mut self) {
        self.0.fill(0);
        std::hint::black_box(&mut self.0);
    }
}

impl fmt::Debug for PrivateKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("PrivateKey(hidden)")
    }
}

/// The phone's static X25519 key pair for one computer.
#[derive(Debug)]
pub struct DeviceKeyPair {
    pub public: [u8; KEY_BYTES],
    pub private: PrivateKey,
}

impl DeviceKeyPair {
    /// The pair as it is sealed: the public key, then the private key.
    /// Callers wipe the buffer once it is sealed.
    pub(crate) fn to_sealed_form(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(2 * KEY_BYTES);
        bytes.extend_from_slice(&self.public);
        bytes.extend_from_slice(self.private.bytes());
        bytes
    }

    /// Reads [`Self::to_sealed_form`] back; `None` when the length is wrong.
    pub(crate) fn from_sealed_form(bytes: &[u8]) -> Option<Self> {
        if bytes.len() != 2 * KEY_BYTES {
            return None;
        }
        let (public, private) = bytes.split_at(KEY_BYTES);
        Some(Self {
            public: public.try_into().ok()?,
            private: PrivateKey::new(private.try_into().ok()?),
        })
    }

    /// Whether both pairs hold the same keys.
    pub fn same_as(&self, other: &DeviceKeyPair) -> bool {
        self.public == other.public && self.private.bytes() == other.private.bytes()
    }
}

/// Overwrites a buffer that held key material with zeros, best effort as
/// in [`PrivateKey`].
pub(crate) fn wipe(bytes: &mut [u8]) {
    bytes.fill(0);
    std::hint::black_box(bytes);
}
