//! Helpers the tests share: hex, and random sources that tests control.

#![allow(dead_code)]

use halonic_e2e_noise_wasm::RandomSource;
use snow::Builder;
use snow::params::{CipherChoice, DHChoice, HashChoice};
use snow::resolvers::{CryptoResolver, DefaultResolver, FallbackResolver};
use snow::types::{Cipher, Dh, Hash, Random};

/// Bytes from a hex string, as the vectors write them.
pub fn hex(text: &str) -> Vec<u8> {
    assert!(
        text.len().is_multiple_of(2),
        "hex needs an even length: {text}"
    );
    (0..text.len())
        .step_by(2)
        .map(|at| u8::from_str_radix(&text[at..at + 2], 16).expect("hex digits"))
        .collect()
}

/// A 32-byte key from a hex string.
pub fn key(text: &str) -> [u8; 32] {
    hex(text).try_into().expect("a 32-byte key")
}

/// Gives the bytes it holds once, then fails: a vector's ephemeral key, and
/// proof that `snow` asks for randomness for nothing else.
pub struct FixedRandom(pub Option<Vec<u8>>);

impl RandomSource for FixedRandom {
    fn fill(&mut self, dest: &mut [u8]) -> bool {
        match self.0.take() {
            Some(bytes) if bytes.len() == dest.len() => {
                dest.copy_from_slice(&bytes);
                true
            }
            _ => false,
        }
    }
}

/// Never gives a byte, like a host whose random function fails.
pub struct NoRandom;

impl RandomSource for NoRandom {
    fn fill(&mut self, _dest: &mut [u8]) -> bool {
        false
    }
}

/// A seeded xorshift: not secret, but different per seed, which is all a
/// test that compares two sessions needs.
pub struct SeededRandom(pub u64);

impl SeededRandom {
    pub fn next_byte(&mut self) -> u8 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0.to_le_bytes()[0]
    }
}

impl RandomSource for SeededRandom {
    fn fill(&mut self, dest: &mut [u8]) -> bool {
        dest.iter_mut().for_each(|byte| *byte = self.next_byte());
        true
    }
}

impl Random for SeededRandom {
    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), snow::Error> {
        RandomSource::fill(self, dest);
        Ok(())
    }
}

/// Gives plain `snow` a seeded random source and nothing else.
struct SeededOnly(u64);

impl CryptoResolver for SeededOnly {
    fn resolve_rng(&self) -> Option<Box<dyn Random>> {
        Some(Box::new(SeededRandom(self.0)))
    }
    fn resolve_dh(&self, _: &DHChoice) -> Option<Box<dyn Dh>> {
        None
    }
    fn resolve_hash(&self, _: &HashChoice) -> Option<Box<dyn Hash>> {
        None
    }
    fn resolve_cipher(&self, _: &CipherChoice) -> Option<Box<dyn Cipher>> {
        None
    }
}

/// Plain `snow` for a protocol, as the phone builds it, with a seeded
/// random source: the crate has no `getrandom`, so `snow` has none of its own.
pub fn snow_builder<'a>(protocol_name: &str, seed: u64) -> Builder<'a> {
    let resolver = FallbackResolver::new(Box::new(SeededOnly(seed)), Box::new(DefaultResolver));
    Builder::with_resolver(protocol_name.parse().expect("params"), Box::new(resolver))
}
