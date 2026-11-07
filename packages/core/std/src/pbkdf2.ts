// PBKDF2 with HMAC-SHA-256 as specified in RFC 8018, section 5.2. scrypt
// uses it, with one iteration, to spread the password over its blocks.
import { hmacSha256Keyed } from "./hmac.ts";
import { sha256DigestBytes } from "./sha256.ts";

/**
 * Derives `keyLength` bytes from a password and a salt with PBKDF2-HMAC-SHA-256.
 * Internal: scrypt is the password hash to use (multi-cloud ADR section 8).
 *
 * @param password - the password bytes
 * @param salt - the salt bytes
 * @param iterations - how many HMAC rounds per output block, 1 or more
 * @param keyLength - how many bytes to derive, 1 or more
 * @returns the derived key
 */
export function pbkdf2Sha256(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLength: number,
): Uint8Array {
  const hmac = hmacSha256Keyed(password);
  const key = new Uint8Array(keyLength);
  const blockCount = Math.ceil(keyLength / sha256DigestBytes);
  for (let blockNumber = 1; blockNumber <= blockCount; blockNumber++) {
    const block = deriveBlock(hmac, salt, iterations, blockNumber);
    const offset = (blockNumber - 1) * sha256DigestBytes;
    key.set(block.subarray(0, keyLength - offset), offset);
  }
  return key;
}

/** F(P, S, c, i) of RFC 8018: U1 = HMAC(S || INT(i)), Un = HMAC(Un-1), and the XOR of all U. */
function deriveBlock(
  hmac: (message: Uint8Array) => Uint8Array,
  salt: Uint8Array,
  iterations: number,
  blockNumber: number,
): Uint8Array {
  const firstMessage = new Uint8Array(salt.length + 4);
  firstMessage.set(salt);
  new DataView(firstMessage.buffer).setUint32(salt.length, blockNumber);
  let previous = hmac(firstMessage);
  const block = previous.slice();
  for (let iteration = 1; iteration < iterations; iteration++) {
    previous = hmac(previous);
    for (let index = 0; index < block.length; index++) {
      block[index] = (block[index] ?? 0) ^ (previous[index] ?? 0);
    }
  }
  return block;
}
