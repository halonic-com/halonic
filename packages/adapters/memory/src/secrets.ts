import type { Secrets, TokenStore } from "@halonicjs/ports";
import { secretKey } from "./secret-names.ts";

/** Configured secrets in a map, for tests and the demo. Read-only, like every `Secrets` adapter. */
export class MemorySecrets implements Secrets {
  readonly #values = new Map<string, string>();

  /**
   * @param values - the configured secrets, by name
   * @throws RangeError when a name breaks the secret name rule
   */
  constructor(values: Readonly<Record<string, string>> = {}) {
    for (const [name, value] of Object.entries(values)) {
      this.#values.set(secretKey(name), value);
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
