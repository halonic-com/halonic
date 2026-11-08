/** Version of the {@link TokenStore} port. A breaking change bumps it and comes with an ADR. */
export const tokenStoreVersion = 1;

/**
 * Secrets the server writes itself, such as Google refresh tokens after a
 * sign-in. Adapters keep them encrypted at rest. Configured secrets are read
 * through {@link Secrets} and never written here.
 *
 * Names follow the same rule as {@link Secrets} names, including that names
 * differing only in case or in `-` versus `_` are the same token. Every
 * method throws a `RangeError` for a name that breaks the rule.
 */
export interface TokenStore {
  /** The token's value, or `null` when there is none. */
  get(name: string): Promise<string | null>;
  /** Creates or replaces a token. */
  set(name: string, value: string): Promise<void>;
  /** Deletes a token. Deleting one that isn't there is not an error. */
  remove(name: string): Promise<void>;
}
