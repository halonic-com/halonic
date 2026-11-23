/**
 * The three things the write-only key routes do with a provider key. It has no
 * way to read a value back, so a route can't leak one even by mistake. A host
 * with a `SecretStore` makes one with `providerKeysOf`.
 */
export interface ProviderKeyStore {
  /** Whether a key is stored under the name. */
  has(name: string): Promise<boolean>;
  /**
   * Saves a key, replacing the one under the same name. A store whose keys can't change throws
   * `ProviderKeysReadOnlyError`, which the routes answer with 409 `keys_read_only`.
   */
  set(name: string, value: string): Promise<void>;
  /** Removes a key. Removing one that isn't stored succeeds. A read-only store throws as `set` does. */
  remove(name: string): Promise<void>;
}
