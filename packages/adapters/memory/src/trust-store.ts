import type { TrustRecord, TrustStore } from "@halonicjs/ports";

/**
 * Trust records in memory, for tests and the browser demo. Each record is
 * kept as JSON text, the way a file in the user's profile would hold it, so
 * every read gives a fresh copy and a damaged record can be modelled.
 */
export class MemoryTrustStore implements TrustStore {
  readonly #texts = new Map<string, string>();

  async get(location: string): Promise<TrustRecord | null> {
    const text = this.#texts.get(location);
    return text === undefined ? null : parseRecord(location, text);
  }

  async grant(record: TrustRecord): Promise<void> {
    this.#texts.set(record.location, JSON.stringify(record));
  }

  async revoke(location: string): Promise<void> {
    this.#texts.delete(location);
  }

  async list(): Promise<TrustRecord[]> {
    // Locations are unique keys, so the order never has to break a tie.
    const entries = [...this.#texts].sort(([a], [b]) => (a < b ? -1 : 1));
    return entries.map(([location, text]) => parseRecord(location, text));
  }

  /**
   * For tests: makes the record for `location` unreadable, as a damaged
   * file would be. `get` and `list` then throw, and `revoke` still deletes it.
   */
  damage(location: string): void {
    this.#texts.set(location, "{");
  }
}

function parseRecord(location: string, text: string): TrustRecord {
  try {
    return JSON.parse(text) as TrustRecord;
  } catch (error) {
    throw new Error(`The trust record for ${JSON.stringify(location)} can't be read.`, {
      cause: error,
    });
  }
}
