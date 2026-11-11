//! Base64url without padding (RFC 4648, section 5), with the rules of
//! `encodeBase64url` and `decodeBase64url` in `@halonicjs/std`, so the page
//! and the shell agree on every byte. Blobs cross the IPC this way, since a
//! command's arguments and answer are JSON. Written out because the
//! standard library has none, and a crate isn't worth it for this.

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// Writes bytes as base64url, without padding.
pub fn encode(bytes: &[u8]) -> String {
    let mut text = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let byte = |index: usize| u32::from(chunk.get(index).copied().unwrap_or(0));
        let bits = (byte(0) << 16) | (byte(1) << 8) | byte(2);
        // Three bytes give four characters; a shorter last chunk gives one fewer per missing byte.
        for index in 0..=chunk.len() {
            let sextet = (bits >> (18 - 6 * index)) & 63;
            text.push(char::from(ALPHABET[sextet as usize]));
        }
    }
    text
}

/// Reads strict base64url text back into bytes: no padding, no other
/// characters, and no stray bits after the last byte, so each byte string
/// has exactly one text that reads as it. `None` when the text isn't that.
pub fn decode(text: &str) -> Option<Vec<u8>> {
    if text.len() % 4 == 1 {
        return None;
    }
    let mut bytes = Vec::with_capacity(text.len() / 4 * 3 + 2);
    for chunk in text.as_bytes().chunks(4) {
        let mut bits: u32 = 0;
        for index in 0..4 {
            let sextet = match chunk.get(index) {
                Some(&character) => sextet_of(character)?,
                None => 0,
            };
            bits = (bits << 6) | sextet;
        }
        // Four characters give three bytes; a shorter last chunk gives one fewer per missing character.
        let byte_count = chunk.len() - 1;
        let stray_bits = bits & ((1 << (8 * (3 - byte_count))) - 1);
        if stray_bits != 0 {
            return None;
        }
        for index in 0..byte_count {
            bytes.push(((bits >> (16 - 8 * index)) & 0xff) as u8);
        }
    }
    Some(bytes)
}

/// The six bits a base64url character stands for, or `None` for any other character.
fn sextet_of(character: u8) -> Option<u32> {
    let value = match character {
        b'A'..=b'Z' => character - b'A',
        b'a'..=b'z' => character - b'a' + 26,
        b'0'..=b'9' => character - b'0' + 52,
        b'-' => 62,
        b'_' => 63,
        _ => return None,
    };
    Some(u32::from(value))
}

#[cfg(test)]
#[path = "base64url_tests.rs"]
mod tests;
