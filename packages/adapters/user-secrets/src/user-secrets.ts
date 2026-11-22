import { checkSecretValue, secretKey } from "@halonicjs/ports";
import {
  checkEndUserId,
  type DataKey,
  makeDataKey,
  openSecret,
  sealSecret,
  UnreadableUserSecretError,
  unwrapDataKey,
} from "./envelope.ts";
import type { KeyEncryptionKey } from "./key-encryption-key.ts";
import type { UserSecretStorage } from "./storage.ts";

/** The version of a user's first data key. Rotating data keys, later, counts up from it. */
export const firstDataKeyVersion = 1;

/**
 * One end user's secrets, sealed in their storage under their own data key.
 * Names follow the `Secrets` name rule and match in `secretKey` form, so
 * `github-token` and `GITHUB_TOKEN` are one secret. Who may call this, and for
 * which run step, is the caller's job; this only keeps values sealed and
 * bound to the user.
 */
export class UserSecrets {
  readonly #kek: KeyEncryptionKey;
  readonly #endUserId: string;
  readonly #storage: UserSecretStorage;

  /**
   * Opens the secrets of `endUserId` in `storage`, which must be that user's own.
   *
   * @throws RangeError when the end user's id is empty
   */
  constructor(kek: KeyEncryptionKey, endUserId: string, storage: UserSecretStorage) {
    checkEndUserId(endUserId);
    this.#kek = kek;
    this.#endUserId = endUserId;
    this.#storage = storage;
  }

  /**
   * Seals and saves a value, making the user's data key on the first one.
   *
   * @throws RangeError when the name breaks the rule, or the value is empty or too long
   */
  async set(name: string, value: string): Promise<void> {
    const key = secretKey(name);
    checkSecretValue(value);
    const dataKey = await this.#dataKeyForWriting();
    await this.#storage.put(key, await sealSecret(dataKey, key, value));
  }

  /**
   * The secret's value, or `null` when none is stored under the name.
   *
   * @throws UnreadableUserSecretError when it or the data key won't open
   */
  async get(name: string): Promise<string | null> {
    const key = secretKey(name);
    const sealed = await this.#storage.get(key);
    if (sealed === null) {
      return null;
    }
    const wrapped = await this.#storage.dataKey();
    if (wrapped === null) {
      throw new UnreadableUserSecretError(
        "A secret is stored, but the user's data key is missing.",
      );
    }
    const dataKey = await unwrapDataKey(this.#kek, this.#endUserId, wrapped);
    return await openSecret(dataKey, key, sealed);
  }

  /** The names of the stored secrets, in `secretKey` form; never a value. */
  async names(): Promise<readonly string[]> {
    return await this.#storage.names();
  }

  /** Removes a secret; removing one that isn't stored changes nothing. */
  async remove(name: string): Promise<void> {
    await this.#storage.remove(secretKey(name));
  }

  async #dataKeyForWriting(): Promise<DataKey> {
    const stored = await this.#storage.dataKey();
    if (stored !== null) {
      return await unwrapDataKey(this.#kek, this.#endUserId, stored);
    }
    const made = await makeDataKey(this.#kek, this.#endUserId, firstDataKeyVersion);
    const kept = await this.#storage.keepDataKey(made.wrapped);
    if (kept === made.wrapped) {
      return made.dataKey;
    }
    return await unwrapDataKey(this.#kek, this.#endUserId, kept);
  }
}
