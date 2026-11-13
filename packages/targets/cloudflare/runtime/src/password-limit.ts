import type { PasswordHasher } from "@halonicjs/ports";

/** The most bytes a password may have, as the hasher reads it: NFC, in UTF-8. */
export const maximumPasswordBytes = 1024;

/**
 * Wraps a hasher so a password over {@link maximumPasswordBytes} costs no work.
 * The hasher runs six PBKDF2 runs on whatever it gets, and a long password
 * makes each of them longer, so a caller who can send one would spend the
 * Worker's CPU on every guess. The length is measured as the hasher reads the
 * password (NFC), because that is what it works on.
 *
 * `verify` answers `false` for a long password: no stored hash can match it,
 * because `hash` refuses to make one. `hash` throws, since that is a deploy-time
 * mistake the person must hear about.
 *
 * @example
 * const hasher = limitPasswordLength(createPbkdf2ChainHasher());
 * await hasher.verify("x".repeat(1025), stored); // false, no PBKDF2 work done
 */
export function limitPasswordLength(hasher: PasswordHasher): PasswordHasher {
  return {
    hash(password) {
      if (isTooLong(password)) {
        throw new RangeError(`The password is longer than ${maximumPasswordBytes} bytes.`);
      }
      return hasher.hash(password);
    },

    async verify(password, text) {
      return isTooLong(password) ? false : hasher.verify(password, text);
    },

    needsRehash(text) {
      return hasher.needsRehash(text);
    },
  };
}

function isTooLong(password: string): boolean {
  return new TextEncoder().encode(password.normalize("NFC")).length > maximumPasswordBytes;
}
