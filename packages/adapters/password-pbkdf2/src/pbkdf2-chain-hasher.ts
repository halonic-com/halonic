import type { PasswordHasher } from "@halonicjs/ports";
import { constantTimeEqual, encodeUtf8 } from "@halonicjs/std";
import { currentRuns, hashLength, readHash, rounds, saltLength, writeHash } from "./hash-text.ts";

/**
 * Creates the chained PBKDF2 {@link PasswordHasher}
 * (`ports.password-hash-format-pbkdf2-chain`). It uses Web Crypto only, so
 * `halonic deploy` makes a cloud target's hash on your machine with the same
 * code the Worker checks it with.
 *
 * Each check costs six runs of 100,000 PBKDF2-SHA256 rounds, about 65 ms of
 * CPU. Callers check the request size and the login limit first, so wrong
 * guesses can't burn that CPU (HAL-136).
 *
 * @returns the hasher
 *
 * @example
 * const hasher = createPbkdf2ChainHasher();
 * const stored = await hasher.hash("a long made-up password");
 * await hasher.verify("a long made-up password", stored); // true
 */
export function createPbkdf2ChainHasher(): PasswordHasher {
  return {
    async hash(password) {
      const salt = crypto.getRandomValues(new Uint8Array(saltLength));
      const hash = await chain(password, salt, currentRuns);
      return writeHash({ runs: currentRuns, salt, hash });
    },

    async verify(password, text) {
      // Read first: a broken hash throws before any PBKDF2 work starts.
      const stored = readHash(text);
      const computed = await chain(password, stored.salt, stored.runs);
      return constantTimeEqual(computed, stored.hash);
    },

    needsRehash(text) {
      return readHash(text).runs !== currentRuns;
    },
  };
}

/**
 * K0 is the NFC password as UTF-8; each run's 32-byte output is the next
 * run's password, with the same salt. A guess can't skip or parallelise runs.
 */
async function chain(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  runs: number,
): Promise<Uint8Array<ArrayBuffer>> {
  let key: Uint8Array<ArrayBuffer> = Uint8Array.from(encodeUtf8(password.normalize("NFC")));
  for (let run = 0; run < runs; run++) {
    key = await pbkdf2(key, salt);
  }
  return key;
}

async function pbkdf2(
  password: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", password, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds },
    key,
    hashLength * 8,
  );
  return new Uint8Array(bits);
}
