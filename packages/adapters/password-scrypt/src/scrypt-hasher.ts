import type { PasswordHasher } from "@halonicjs/ports";
import { constantTimeEqual, encodeUtf8 } from "@halonicjs/std";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import {
  currentSettings,
  isCurrent,
  keyLength,
  readHash,
  type ScryptSettings,
  saltLength,
  writeHash,
} from "./hash-text.ts";

/**
 * Creates the scrypt {@link PasswordHasher} (`ports.password-hash-format`),
 * the format `serve` uses. New hashes use ln=14, r=8, p=5.
 *
 * `verify` reads the stored hash first, so a broken or out-of-range hash
 * throws a `RangeError` before any scrypt work starts. Callers check the
 * request size and the login limit first, so wrong guesses can't burn CPU.
 *
 * @returns the hasher
 *
 * @example
 * const hasher = createScryptHasher();
 * const stored = await hasher.hash("a long made-up password");
 * await hasher.verify("a long made-up password", stored); // true
 */
export function createScryptHasher(): PasswordHasher {
  return {
    async hash(password) {
      const salt = crypto.getRandomValues(new Uint8Array(saltLength));
      const key = await derive(password, salt, currentSettings);
      return writeHash({ ...currentSettings, salt, key });
    },

    async verify(password, text) {
      const stored = readHash(text);
      const computed = await derive(password, stored.salt, stored);
      return constantTimeEqual(computed, stored.key);
    },

    needsRehash(text) {
      return !isCurrent(readHash(text));
    },
  };
}

/** The key of the NFC password as UTF-8, so one typed password has one hash. */
async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  { logN, r, p }: ScryptSettings,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await scryptAsync(encodeUtf8(password.normalize("NFC")), salt, {
    N: 2 ** logN,
    r,
    p,
    dkLen: keyLength,
  });
  return Uint8Array.from(key);
}
