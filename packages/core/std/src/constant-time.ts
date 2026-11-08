/**
 * Compares two byte arrays in time that depends only on their length, never
 * on where they first differ. Use it to check password hashes and tokens, so
 * an attacker can't learn a secret from how long a comparison takes.
 *
 * Arrays of different lengths are unequal at once: lengths aren't secret
 * here, because hashes and tokens have a fixed length.
 *
 * @param first - the first bytes
 * @param second - the second bytes
 * @returns true when both hold the same bytes
 *
 * @example
 * constantTimeEqual(storedHash, await hasher.hash(password, salt)); // true or false
 */
export function constantTimeEqual(first: Uint8Array, second: Uint8Array): boolean {
  if (first.length !== second.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < first.length; index++) {
    // No early exit: every byte is compared, and differences pile up in one number.
    difference |= (first[index] ?? 0) ^ (second[index] ?? 0);
  }
  return difference === 0;
}
