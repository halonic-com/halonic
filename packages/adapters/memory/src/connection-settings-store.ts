import type {
  ConnectionKey,
  ConnectionSettingsRecord,
  ConnectionSettingsStore,
} from "@halonicjs/ports";

/**
 * Connection settings in memory, for tests and the browser demo. Each
 * record is kept as JSON text, the way a file in the user's profile would
 * hold it, so every read gives a fresh copy and damaged settings can be
 * modelled.
 */
export class MemoryConnectionSettingsStore implements ConnectionSettingsStore {
  readonly #texts = new Map<string, string>();

  async get(key: ConnectionKey): Promise<ConnectionSettingsRecord | null> {
    const text = this.#texts.get(keyId(key));
    return text === undefined ? null : parseSettings(key, text);
  }

  async save(settings: ConnectionSettingsRecord): Promise<void> {
    this.#texts.set(keyId(settings), JSON.stringify(settings));
  }

  async remove(key: ConnectionKey): Promise<void> {
    this.#texts.delete(keyId(key));
  }

  /**
   * For tests: makes the settings for `key` unreadable, as a file cut off
   * halfway would be. `get` then throws, and `remove` still deletes them.
   *
   * @throws when there are no settings for `key`, so a test can't create
   *   damaged settings it never saved
   */
  damage(key: ConnectionKey): void {
    const text = this.#texts.get(keyId(key));
    if (text === undefined) {
      throw new Error(`There are no connection settings for ${describeKey(key)} to damage.`);
    }
    this.#texts.set(keyId(key), text.slice(0, -1));
  }
}

/** One string per key. JSON keeps a location with a `/` or `:` from running into the connector id. */
function keyId(key: ConnectionKey): string {
  return JSON.stringify([key.location, key.connector]);
}

function describeKey(key: ConnectionKey): string {
  return `${JSON.stringify(key.connector)} in ${JSON.stringify(key.location)}`;
}

function parseSettings(key: ConnectionKey, text: string): ConnectionSettingsRecord {
  try {
    return JSON.parse(text) as ConnectionSettingsRecord;
  } catch {
    // No `cause`: the parser's message can quote the text it read.
    throw new Error(`The connection settings for ${describeKey(key)} can't be read.`);
  }
}
