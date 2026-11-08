import type { Secrets, TokenStore } from "@halonicjs/ports";
import { secretKey } from "./secret-names.ts";

/** Configured secrets in a map, for tests and the demo. Read-only, like every `Secrets` adapter. */
export class MemorySecrets implements Secrets {
  readonly #values = new Map<string, string>();

  /**
   * @param values - the configured secrets, by name
   * @throws RangeError when a name breaks the secret name rule, or two names are the same secret
   */
  constructor(values: Readonly<Record<string, string>> = {}) {
    const namesByKey = new Map<string, string>();
    for (const [name, value] of Object.entries(values)) {
      const key = secretKey(name);
      const earlier = namesByKey.get(key);
      // Keeping either value would hide a configuration mistake.
      if (earlier !== undefined) {
        throw new RangeError(
          `Secret names ${JSON.stringify(earlier)} and ${JSON.stringify(name)} are the same secret ${key}; configure it once.`,
        );
      }
      namesByKey.set(key, name);
      this.#values.set(key, value);
    }
  }

  async get(name: string): Promise<string | null> {
    return this.#values.get(secretKey(name)) ?? null;
  }
}

/** Tokens the server writes, in a map. Nothing is at rest here, so there is nothing to encrypt. */
export class MemoryTokenStore implements TokenStore {
  readonly #values = new Map<string, string>();

  async get(name: string): Promise<string | null> {
    return this.#values.get(secretKey(name)) ?? null;
  }

  async set(name: string, value: string): Promise<void> {
    this.#values.set(secretKey(name), value);
  }

  async remove(name: string): Promise<void> {
    this.#values.delete(secretKey(name));
  }
}
