//! SHA-256 (FIPS 180-4) for the Studio shell, with no dependencies
//! (HAL-2612). The shell's trust store names each record file by the
//! SHA-256 of its location, as `FileTrustStore` in `fs-node` does with
//! Node's `crypto`, so both must hash exactly alike. `sha2` is not on the
//! plan's list of approved libraries, so the shell keeps its own.

/// The bytes in one block: SHA-256 works on 512 bits at a time.
const BLOCK_BYTES: usize = 64;

/// The first 32 bits of the fractional parts of the square roots of the
/// first 8 primes: the hash's starting state.
#[rustfmt::skip]
const INITIAL_STATE: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

/// The first 32 bits of the fractional parts of the cube roots of the first
/// 64 primes: one constant per round.
#[rustfmt::skip]
const ROUND_CONSTANTS: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/// A SHA-256 hash in progress. Give it the bytes in as many parts as you
/// like with [`Self::update`]; [`Self::finish`] gives the same digest as
/// hashing them all at once.
#[derive(Debug, Clone)]
pub struct Sha256 {
    state: [u32; 8],
    /// Bytes given that don't fill a block yet.
    pending: Vec<u8>,
    /// Every byte given so far, for the length at the end.
    total_bytes: u64,
}

/// A finished SHA-256 hash: 32 bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Digest(pub [u8; 32]);

impl Default for Sha256 {
    fn default() -> Self {
        Self::new()
    }
}

impl Sha256 {
    /// A hash of no bytes yet.
    pub fn new() -> Self {
        Self {
            state: INITIAL_STATE,
            pending: Vec::with_capacity(BLOCK_BYTES),
            total_bytes: 0,
        }
    }

    /// Adds bytes to the hash.
    pub fn update(mut self, bytes: &[u8]) -> Self {
        self.total_bytes = self.total_bytes.wrapping_add(bytes.len() as u64);
        self.pending.extend_from_slice(bytes);
        let (blocks, rest) = self.pending.as_chunks::<BLOCK_BYTES>();
        for block in blocks {
            compress(&mut self.state, block);
        }
        // What doesn't fill a block waits for the next bytes.
        self.pending = rest.to_vec();
        self
    }

    /// Pads the bytes given, as FIPS 180-4 section 5.1.1 says, and gives
    /// the digest: a `1` bit, zeros up to 8 bytes short of a block, then the
    /// length in bits as a big-endian 64-bit number.
    pub fn finish(self) -> Digest {
        let length_in_bits = self.total_bytes.wrapping_mul(8);
        let mut padding = vec![0x80_u8];
        let used = (self.pending.len() + 1) % BLOCK_BYTES;
        let zeros = (BLOCK_BYTES + BLOCK_BYTES - 8 - used) % BLOCK_BYTES;
        padding.resize(1 + zeros, 0);
        padding.extend_from_slice(&length_in_bits.to_be_bytes());

        // `update` would count the padding in the length, so the blocks are
        // compressed here.
        let mut state = self.state;
        let mut tail = self.pending;
        tail.extend_from_slice(&padding);
        // The padding makes the tail whole blocks, so nothing is left over.
        let (blocks, _) = tail.as_chunks::<BLOCK_BYTES>();
        for block in blocks {
            compress(&mut state, block);
        }

        let mut digest = [0_u8; 32];
        for (bytes, word) in digest.as_chunks_mut::<4>().0.iter_mut().zip(state) {
            *bytes = word.to_be_bytes();
        }
        Digest(digest)
    }
}

impl Digest {
    /// The digest as 64 lower-case hex characters, as Node's
    /// `digest("hex")` gives it.
    pub fn to_hex(&self) -> String {
        self.0.iter().map(|byte| format!("{byte:02x}")).collect()
    }
}

/// The SHA-256 of `bytes`.
pub fn sha256(bytes: &[u8]) -> Digest {
    Sha256::new().update(bytes).finish()
}

/// Mixes one 64-byte block into the state (FIPS 180-4 section 6.2.2).
fn compress(state: &mut [u32; 8], block: &[u8; BLOCK_BYTES]) {
    // The block's 16 words, then 48 more worked out from the earlier ones.
    let (words, _) = block.as_chunks::<4>();
    let mut schedule: Vec<u32> = words.iter().copied().map(u32::from_be_bytes).collect();
    while schedule.len() < 64 {
        let round = schedule.len();
        let earlier = schedule[round - 15];
        let recent = schedule[round - 2];
        let sigma0 = earlier.rotate_right(7) ^ earlier.rotate_right(18) ^ (earlier >> 3);
        let sigma1 = recent.rotate_right(17) ^ recent.rotate_right(19) ^ (recent >> 10);
        schedule.push(
            schedule[round - 16]
                .wrapping_add(sigma0)
                .wrapping_add(schedule[round - 7])
                .wrapping_add(sigma1),
        );
    }

    let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = *state;
    for (constant, word) in ROUND_CONSTANTS.iter().zip(schedule) {
        let sum1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let choice = (e & f) ^ (!e & g);
        let temp1 = h
            .wrapping_add(sum1)
            .wrapping_add(choice)
            .wrapping_add(*constant)
            .wrapping_add(word);
        let sum0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let majority = (a & b) ^ (a & c) ^ (b & c);
        let temp2 = sum0.wrapping_add(majority);
        h = g;
        g = f;
        f = e;
        e = d.wrapping_add(temp1);
        d = c;
        c = b;
        b = a;
        a = temp1.wrapping_add(temp2);
    }
    for (word, mixed) in state.iter_mut().zip([a, b, c, d, e, f, g, h]) {
        *word = word.wrapping_add(mixed);
    }
}
