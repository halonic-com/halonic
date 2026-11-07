// HMAC-SHA-256 as specified in RFC 2104. PBKDF2, and so scrypt, build on it.
import { sha256, sha256BlockBytes } from "./sha256.ts";
import { encodeUtf8 } from "./utf8.ts";

const innerPadByte = 0x36;
const outerPadByte = 0x5c;

/**
 * Computes the HMAC-SHA-256 of a message under a key.
 *
 * @param key - the secret key, as bytes or as text (UTF-8); any length
 * @param message - the message, as bytes or as text (UTF-8)
 * @returns the 32-byte authentication code
 *
 * @example
 * bytesToHex(hmacSha256("key", "The quick brown fox jumps over the lazy dog"));
 * // "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
 */
export function hmacSha256(key: Uint8Array | string, message: Uint8Array | string): Uint8Array {
  return hmacSha256Keyed(key)(typeof message === "string" ? encodeUtf8(message) : message);
}

/**
 * Prepares the key once and returns a function that computes the HMAC of
 * each message. PBKDF2 calls it thousands of times with the same key.
 */
export function hmacSha256Keyed(key: Uint8Array | string): (message: Uint8Array) => Uint8Array {
  const keyBytes = typeof key === "string" ? encodeUtf8(key) : key;
  // A key longer than a block is hashed first (RFC 2104, section 2).
  const shortKey = keyBytes.length > sha256BlockBytes ? sha256(keyBytes) : keyBytes;
  const innerPad = new Uint8Array(sha256BlockBytes).fill(innerPadByte);
  const outerPad = new Uint8Array(sha256BlockBytes).fill(outerPadByte);
  for (let index = 0; index < shortKey.length; index++) {
    const keyByte = shortKey[index] ?? 0;
    innerPad[index] = innerPadByte ^ keyByte;
    outerPad[index] = outerPadByte ^ keyByte;
  }
  return (message) => {
    const inner = sha256(concat(innerPad, message));
    return sha256(concat(outerPad, inner));
  };
}

function concat(first: Uint8Array, second: Uint8Array): Uint8Array {
  const joined = new Uint8Array(first.length + second.length);
  joined.set(first);
  joined.set(second, first.length);
  return joined;
}
