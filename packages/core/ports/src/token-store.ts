/** Version of the {@link TokenStore} port. A breaking change bumps it and comes with an ADR. */
export const tokenStoreVersion = 1;

/**
 * Secrets the server writes itself, such as Google refresh tokens after a
 * sign-in. Adapters keep them encrypted at rest. Configured secrets are read
 * through {@link Secrets} and never written here.
 */
export interface TokenStore {
  /** The token's value, or `null` when there is none. */
  get(name: string): Promise<string | null>;
  /** Creates or replaces a token. */
  set(name: string, value: string): Promise<void>;
  /** Deletes a token. Deleting one that isn't there is not an error. */
  remove(name: string): Promise<void>;
}
