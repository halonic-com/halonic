import { assert, type RandomBytes } from "@halonicjs/std";

/**
 * How many random bytes go into a PKCE verifier and into a `state`. 32 bytes
 * is 256 bits, the amount RFC 7636 (section 7.1) recommends for the verifier,
 * and it encodes to 43 base64url characters.
 */
export const secretByteCount = 32;

/** The platform's cryptographically secure randomness, through Web Crypto. */
export const webRandomBytes: RandomBytes = (byteCount) =>
  crypto.getRandomValues(new Uint8Array(byteCount));

/**
 * Asks `randomBytes` for `secretByteCount` bytes and checks it gave exactly
 * that many, so a broken source can never shorten a secret without notice.
 *
 * @param randomBytes - where the bytes come from
 * @returns 32 random bytes
 * @throws AssertionError when `randomBytes` returns another number of bytes
 */
export function secretBytes(randomBytes: RandomBytes): Uint8Array {
  const bytes = randomBytes(secretByteCount);
  assert(
    bytes.length === secretByteCount,
    `The random source gave ${bytes.length} bytes, but a sign-in secret needs ${secretByteCount}.`,
  );
  return bytes;
}
