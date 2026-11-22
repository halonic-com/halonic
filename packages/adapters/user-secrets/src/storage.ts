/**
 * Where one end user's wrapped data key and sealed secrets are kept: on a
 * deployment, that user's own storage. It holds only what `UserSecrets` hands
 * it, which is never a value in the clear. Secret names arrive in `secretKey`
 * form.
 *
 * The storage is trusted to keep values current: it could hand back an older
 * sealed value of the same name for the same user, or drop one, and the
 * encryption can't tell. Sealing protects only what the values say.
 */
export interface UserSecretStorage {
  /** The wrapped data key, or `null` before the first secret is stored. */
  dataKey(): Promise<string | null>;
  /**
   * Keeps `wrapped` as the data key unless one is stored already, and gives
   * the one stored afterwards, so two first writes at once agree on one key
   * and no secret is sealed with a key that gets lost.
   */
  keepDataKey(wrapped: string): Promise<string>;
  /** Saves a sealed secret, replacing the one stored under the same name. */
  put(name: string, sealed: string): Promise<void>;
  /** The sealed secret, or `null` when none is stored under the name. */
  get(name: string): Promise<string | null>;
  /** The names of the stored secrets, sorted; never a sealed value. */
  names(): Promise<readonly string[]>;
  /** Removes a secret. Removing one that isn't stored succeeds and changes nothing. */
  remove(name: string): Promise<void>;
}

/** A {@link UserSecretStorage} in memory, for tests and one running program. */
export class MemoryUserSecretStorage implements UserSecretStorage {
  #dataKey: string | null = null;
  readonly #secrets = new Map<string, string>();

  /** Gives the wrapped data key, or `null`. */
  async dataKey(): Promise<string | null> {
    return this.#dataKey;
  }

  /** Keeps the first wrapped data key it is given. */
  async keepDataKey(wrapped: string): Promise<string> {
    this.#dataKey ??= wrapped;
    return this.#dataKey;
  }

  /** Saves a sealed secret. */
  async put(name: string, sealed: string): Promise<void> {
    this.#secrets.set(name, sealed);
  }

  /** Gives a sealed secret, or `null`. */
  async get(name: string): Promise<string | null> {
    return this.#secrets.get(name) ?? null;
  }

  /** Gives the stored names, sorted. */
  async names(): Promise<readonly string[]> {
    return [...this.#secrets.keys()].sort();
  }

  /** Removes a secret, if it is stored. */
  async remove(name: string): Promise<void> {
    this.#secrets.delete(name);
  }
}
