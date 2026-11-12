/** Version of the {@link PasswordHasher} port. A breaking change bumps it and comes with an ADR. */
export const passwordHasherVersion = 1;

/**
 * Hashes and checks the sign-in password.
 *
 * **Two formats.** Each adapter makes exactly one format, and the target
 * decides which: a hash verifies on any adapter of the same format. The
 * hash is self-describing text, and each format has its own requirement with
 * known-answer vectors:
 *
 * ```text
 * $scrypt$ln=<log2 N>,r=<r>,p=<p>$<salt>$<key>        serve
 * $pbkdf2-sha256-chain$i=<rounds>,n=<runs>$<salt>$<hash>   cloud targets
 * ```
 *
 * Cloud targets can't use scrypt: WebCrypto has no memory-hard hash, and a
 * Worker has too little memory for scrypt at safe settings. So they chain
 * PBKDF2-SHA256, each run's output being the next run's input, which costs
 * an attacker the same per guess as one run of `i × n` rounds (HAL-136).
 * The hash for a cloud target is made on your machine at deploy time, with
 * the same adapter the Worker checks it with.
 *
 * **What both formats share:**
 * - The salt is exactly 16 random bytes from `crypto.getRandomValues`, and the
 *   key or hash exactly 32 bytes. Both are standard base64 without `=`
 *   padding; any other length, or padding, makes the hash malformed.
 * - The password is normalised to Unicode NFC and then encoded as UTF-8, so
 *   "é" typed as one character or as "e" plus an accent gives the same hash.
 *
 * **scrypt** (requirement `ports.password-hash-format`): new hashes use
 * ln=14, r=8, p=5. `verify` accepts only ln 14 to 15, r exactly 8 and p 5 to
 * 16. The upper bounds keep a configured hash within a Worker's memory
 * (ln=15 needs 32 MiB; ln=20 would need 1 GiB).
 *
 * **Chained PBKDF2** (requirement `ports.password-hash-format-pbkdf2-chain`):
 * new hashes use i=100000, n=6. `verify` accepts only i exactly 100000 (the
 * most a Worker allows per run) and n 6 to 20.
 */
export interface PasswordHasher {
  /** A new hash with its own salt and the current settings, safe to store. */
  hash(password: string): Promise<string>;
  /**
   * Whether the password matches the hash. Takes the same time whether it
   * does or not.
   *
   * @throws RangeError when the hash is malformed, in another format (the
   *   other format above included), or uses settings outside the allowed
   *   range. A broken hash is a configuration error, and returning `false`
   *   would hide it behind "wrong password".
   */
  verify(password: string, hash: string): Promise<boolean>;
  /**
   * Whether the hash uses other settings than new hashes do (for scrypt
   * anything but ln=14, r=8, p=5; for chained PBKDF2 any n but 6). The
   * sign-in password hash is a configured, read-only secret, so nothing
   * replaces it automatically: the host reports it, and the hash is replaced
   * by setting the password again (CLI, or `halonic deploy` for a cloud
   * target).
   *
   * @throws RangeError as {@link PasswordHasher.verify} does
   */
  needsRehash(hash: string): boolean;
}
