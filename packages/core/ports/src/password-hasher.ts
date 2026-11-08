/** Version of the {@link PasswordHasher} port. A breaking change bumps it and comes with an ADR. */
export const passwordHasherVersion = 1;

/**
 * Hashes and checks the sign-in password. Every runtime uses scrypt from
 * `core/std` (plan 11), so a hash made on your machine for a cloud
 * deployment verifies there.
 *
 * **The hash format** is self-describing text, the same on every adapter
 * (requirement `ports.password-hash-format` has a known-answer vector):
 *
 * ```text
 * $scrypt$ln=<log2 N>,r=<r>,p=<p>$<salt>$<key>
 * ```
 *
 * - The salt is 16 random bytes from `crypto.getRandomValues`, and the key is
 *   32 bytes. Both are standard base64 without `=` padding.
 * - New hashes use ln=14, r=8, p=5 (multi-cloud ADR section 8). `verify`
 *   accepts no settings below that.
 * - The password is normalised to Unicode NFC and then encoded as UTF-8, so
 *   "é" typed as one character or as "e" plus an accent gives the same hash.
 */
export interface PasswordHasher {
  /** A new hash with its own salt and the current settings, safe to store. */
  hash(password: string): Promise<string>;
  /**
   * Whether the password matches the hash. Takes the same time whether it
   * does or not.
   *
   * @throws RangeError when the hash is malformed, in another format, or uses
   *   settings below the minimum. A broken hash is a configuration error, and
   *   returning `false` would hide it behind "wrong password".
   */
  verify(password: string, hash: string): Promise<boolean>;
  /**
   * Whether the hash uses older settings than new hashes do. The sign-in
   * password hash is a configured, read-only secret, so nothing replaces it
   * automatically: the host reports it, and the hash is replaced by setting
   * the password again (CLI).
   *
   * @throws RangeError as {@link PasswordHasher.verify} does
   */
  needsRehash(hash: string): boolean;
}
