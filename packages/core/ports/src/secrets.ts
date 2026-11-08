/** Version of the {@link Secrets} port. A breaking change bumps it and comes with an ADR. */
export const secretsVersion = 1;

/**
 * The secrets someone configured: provider keys, the sign-in password hash,
 * the token key. Read-only at run time (OS keychain, a mode-0600 file,
 * environment variables, Workers secrets). What the server writes itself goes
 * in the {@link TokenStore} instead.
 *
 * **Names** match `^[A-Za-z][A-Za-z0-9_-]*$` and are at most 128 characters,
 * so the same name works as an environment variable, a Workers secret and a
 * keychain entry.
 *
 * **Two names that differ only in upper and lower case, or in `-` versus
 * `_`, are the same secret on every adapter.** The old environment adapter
 * upper-cased names and mapped `-` to `_` (`serve-password` is
 * `STUDIO_SECRET_SERVE_PASSWORD`), so a keychain or file store must match
 * names the same way. A prefix is up to the adapter.
 */
export interface Secrets {
  /**
   * The secret's value, or `null` when it isn't configured.
   *
   * @throws RangeError when the name breaks the rule above
   */
  get(name: string): Promise<string | null>;
}
