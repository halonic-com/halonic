//! The codes of phone pairing on the phone's side (requirement
//! `pairing-codes`): the Noise psk taken from the 12-character pairing code,
//! the 6-character check code taken from the handshake hash, and the
//! commitment to pairing message 3. The rules are those of `pairing-codes.ts`
//! and `remote-gateway-session.ts` in `@halonicjs/ports`; HKDF-SHA256 and
//! SHA-256 come from the `hkdf` and `sha2` crates.

use std::fmt;

use hkdf::Hkdf;
use sha2::{Digest, Sha256};

/// The 31 symbols of both codes: digits and capitals without 0, O, 1, I and
/// L, which are easy to mistake for each other.
pub const PAIRING_ALPHABET: &str = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/// A pairing code is this many symbols, about 59 bits.
pub const PAIRING_CODE_LENGTH: usize = 12;

/// A check code is this many symbols.
pub const CHECK_CODE_LENGTH: usize = 6;

/// The HKDF-SHA256 info that turns a pairing code into the Noise psk. The
/// salt is empty and the output 32 bytes.
pub const PAIRING_PSK_INFO: &str = "halonic pair psk v1";

/// The HKDF-SHA256 info that turns the pairing handshake's hash into the
/// bytes of the check code. The salt is empty and the output
/// [`CHECK_CODE_INPUT_BYTES`] bytes.
pub const CHECK_CODE_INFO: &str = "halonic pair check v1";

/// How many HKDF bytes a check code is read from.
pub const CHECK_CODE_INPUT_BYTES: usize = 8;

/// What the phone's commitment to pairing message 3 starts with, in ASCII.
pub const PAIR_COMMIT_LABEL: &str = "halonic pair commit v1";

/// A pairing code in its plain form: exactly 12 symbols of
/// [`PAIRING_ALPHABET`]. The page reads what the person typed with
/// `readPairingCode` (any case, spaces and dots) and hands over the plain
/// form, so this side accepts nothing else.
///
/// Its `Debug` form leaves the code out, so a log line never holds it.
#[derive(Clone, PartialEq, Eq)]
pub struct PairingCode(String);

impl PairingCode {
    /// The code, or `None` when `plain` isn't 12 symbols of the alphabet.
    pub fn parse(plain: &str) -> Option<Self> {
        let all_symbols = plain
            .chars()
            .all(|symbol| PAIRING_ALPHABET.contains(symbol));
        (plain.len() == PAIRING_CODE_LENGTH && all_symbols).then(|| Self(plain.to_owned()))
    }

    /// The Noise psk for the pairing handshake: HKDF-SHA256 of the code's
    /// ASCII, with an empty salt and the info [`PAIRING_PSK_INFO`]. The code
    /// itself is never sent.
    pub fn psk(&self) -> [u8; 32] {
        hkdf_sha256(self.0.as_bytes(), PAIRING_PSK_INFO)
    }
}

impl fmt::Debug for PairingCode {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("PairingCode(…)")
    }
}

/// A check code in its plain form, 6 symbols of [`PAIRING_ALPHABET`]. The
/// page shows it in two groups of three.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckCode(String);

impl CheckCode {
    /// The 6 symbols, most significant first.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// The check code both screens show for a pairing handshake: HKDF-SHA256 of
/// its handshake hash, with an empty salt and the info [`CHECK_CODE_INFO`],
/// read by [`check_code_from_bytes`].
pub fn check_code(handshake_hash: &[u8]) -> CheckCode {
    check_code_from_bytes(hkdf_sha256(handshake_hash, CHECK_CODE_INFO))
}

/// The check code for 8 HKDF bytes: an unsigned 64-bit big-endian number,
/// reduced mod 31⁶ and written as 6 symbols, most significant first. The
/// bias from the reduction is under 2⁻³⁴.
pub fn check_code_from_bytes(bytes: [u8; CHECK_CODE_INPUT_BYTES]) -> CheckCode {
    let alphabet = PAIRING_ALPHABET.as_bytes();
    let base = alphabet.len() as u64;
    let mut rest = u64::from_be_bytes(bytes) % base.pow(CHECK_CODE_LENGTH as u32);
    let mut symbols = [0u8; CHECK_CODE_LENGTH];
    for symbol in symbols.iter_mut().rev() {
        *symbol = alphabet[(rest % base) as usize];
        rest /= base;
    }
    CheckCode(symbols.iter().map(|&symbol| char::from(symbol)).collect())
}

/// The phone's commitment to its pairing message 3, sent in message 1: the
/// SHA-256 of [`PAIR_COMMIT_LABEL`], its static public key and the exact
/// bytes of its message 3 payload. The host recomputes it once message 3
/// decrypts, so someone who knows the code can't search for a message 3
/// that makes the two check codes match.
pub fn pair_commit(phone_static_key: &[u8; 32], payload3: &[u8]) -> [u8; 32] {
    Sha256::new()
        .chain_update(PAIR_COMMIT_LABEL)
        .chain_update(phone_static_key)
        .chain_update(payload3)
        .finalize()
        .into()
}

/// HKDF-SHA256 with an empty salt, `N` bytes out.
fn hkdf_sha256<const N: usize>(input: &[u8], info: &str) -> [u8; N] {
    let mut output = [0u8; N];
    Hkdf::<Sha256>::new(None, input)
        .expand(info.as_bytes(), &mut output)
        .expect("HKDF-SHA256 gives up to 8,160 bytes, far more than any caller asks for");
    output
}
