/** Version of the {@link PasswordHasher} port. A breaking change bumps it and comes with an ADR. */
export const passwordHasherVersion = 1;

/**
 * Hashes and checks the sign-in password. Every runtime uses scrypt from
 * `core/std` (plan 11), so a hash made on your machine for a cloud
 * deployment verifies there.
 */
export interface PasswordHasher {
  /** A new hash with its own salt and settings, safe to store. */
  hash(password: string): Promise<string>;
  /** Whether the password matches the hash. Takes the same time whether it does or not. */
  verify(password: string, hash: string): Promise<boolean>;
  /** Whether the hash uses older settings and should be replaced after the next successful sign-in. */
  needsRehash(hash: string): boolean;
}
