import type { UsageStorage } from "./usage-types.ts";

const dataKeyKey = "user-secrets/data-key";
const secretPrefix = "user-secrets/secret/";

/** The most secrets one person may keep, so one account can't fill the object's storage. */
export const maxUserSecrets = 100;

/**
 * The longest sealed value or wrapped key the shelf keeps. A secret's value is at most 65,536
 * characters, so 196,608 bytes as UTF-8; sealed and in base64url it stays well under this.
 */
export const maxSealedLength = 300_000;

/** A secret's name in `secretKey` form: a capital letter, then capitals, digits or `_`. */
const secretKeyPattern = /^[A-Z][A-Z0-9_]{0,127}$/;

/**
 * One person's sealed secrets and their wrapped data key, in their usage object's storage. It
 * keeps only what the Worker's `UserSecrets` hands it, which is never a value in the clear, so it
 * can't open anything itself: the key-encryption key never reaches the object. Which scope may
 * call it is the object's check, before any call reaches the shelf.
 */
export class UserSecretShelf {
  readonly #storage: UsageStorage;

  constructor(storage: UsageStorage) {
    this.#storage = storage;
  }

  /** The wrapped data key, or `null` before the first secret is stored. */
  dataKey(): string | null {
    return this.#storage.get<string>(dataKeyKey) ?? null;
  }

  /**
   * Keeps `wrapped` unless a data key is stored already, and gives the one stored afterwards, so
   * two first writes agree on one key.
   *
   * @throws RangeError when `wrapped` isn't a string of at most {@link maxSealedLength} characters
   */
  keepDataKey(wrapped: string): string {
    checkSealed("A wrapped data key", wrapped);
    return this.#storage.transactionSync(() => {
      const stored = this.#storage.get<string>(dataKeyKey);
      if (stored !== undefined) return stored;
      this.#storage.put(dataKeyKey, wrapped);
      return wrapped;
    });
  }

  /**
   * Saves a sealed secret, replacing the one stored under the same name.
   *
   * @throws RangeError when the name isn't in `secretKey` form, the sealed value is too long, or a
   *   new name would pass {@link maxUserSecrets}
   */
  put(name: string, sealed: string): void {
    const key = secretStorageKey(name);
    checkSealed("A sealed secret", sealed);
    this.#storage.transactionSync(() => {
      const isNew = this.#storage.get<string>(key) === undefined;
      if (isNew && this.names().length >= maxUserSecrets) {
        throw new RangeError(`A person can keep at most ${maxUserSecrets} secrets.`);
      }
      this.#storage.put(key, sealed);
    });
  }

  /** The sealed secret, or `null` when none is stored under the name. */
  get(name: string): string | null {
    return this.#storage.get<string>(secretStorageKey(name)) ?? null;
  }

  /** The names of the stored secrets, sorted; never a sealed value. */
  names(): readonly string[] {
    const names: string[] = [];
    for (const [key] of this.#storage.list<string>(secretPrefix)) {
      names.push(key.slice(secretPrefix.length));
    }
    return names.sort();
  }

  /** Removes a secret; removing one that isn't stored changes nothing. */
  remove(name: string): void {
    const key = secretStorageKey(name);
    this.#storage.transactionSync(() => this.#storage.delete(key));
  }
}

/**
 * @throws RangeError when `name` isn't in `secretKey` form
 */
function secretStorageKey(name: string): string {
  if (typeof name !== "string" || !secretKeyPattern.test(name)) {
    throw new RangeError(
      'A secret\'s name must be in key form: a capital letter, then capitals, digits or "_".',
    );
  }
  return `${secretPrefix}${name}`;
}

/**
 * @throws RangeError when `sealed` isn't a string of 1 to {@link maxSealedLength} characters
 */
function checkSealed(what: string, sealed: string): void {
  if (typeof sealed !== "string" || sealed === "" || sealed.length > maxSealedLength) {
    throw new RangeError(`${what} must be 1 to ${maxSealedLength} characters.`);
  }
}
