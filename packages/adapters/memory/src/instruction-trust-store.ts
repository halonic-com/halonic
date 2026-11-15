import {
  type InstructionTrustKey,
  type InstructionTrustRecord,
  type InstructionTrustStore,
  isInstructionTrustFor,
} from "@halonicjs/ports";

/**
 * Trusted instructions in memory, for tests and the browser demo (requirement
 * `memory.instruction-trust-store`). Each record is kept as JSON text, the
 * way a file in the user's profile would hold it, so every read gives a
 * fresh copy and a damaged record can be modelled.
 */
export class MemoryInstructionTrustStore implements InstructionTrustStore {
  readonly #texts = new Map<string, string>();

  async get(key: InstructionTrustKey): Promise<InstructionTrustRecord | null> {
    const text = this.#texts.get(keyId(key));
    return text === undefined ? null : parseRecord(key, text);
  }

  async save(record: InstructionTrustRecord): Promise<void> {
    this.#texts.set(keyId(record), JSON.stringify(record));
  }

  async remove(key: InstructionTrustKey): Promise<void> {
    this.#texts.delete(keyId(key));
  }

  /**
   * For tests: makes the record for `key` unreadable, as a damaged file
   * would be. `get` then throws, and `remove` and `save` still work.
   *
   * @throws when there is no record for `key`, so a test can't create a
   *   damaged record it never saved
   */
  damage(key: InstructionTrustKey): void {
    const id = keyId(key);
    if (!this.#texts.has(id)) {
      throw new Error(`There are no trusted instructions for ${describeKey(key)} to damage.`);
    }
    this.#texts.set(id, "{");
  }
}

/** One string per key. JSON keeps a location with a `/` from running into the agent id. */
function keyId(key: InstructionTrustKey): string {
  return JSON.stringify([key.location, key.agent]);
}

function describeKey(key: InstructionTrustKey): string {
  return `the agent ${JSON.stringify(key.agent)} in ${JSON.stringify(key.location)}`;
}

/** Reads a record, and refuses one that isn't exactly trusted instructions for this key. */
function parseRecord(key: InstructionTrustKey, text: string): InstructionTrustRecord {
  let record: unknown;
  try {
    record = JSON.parse(text);
  } catch (error) {
    throw new Error(`The trusted instructions for ${describeKey(key)} can't be read.`, {
      cause: error,
    });
  }
  if (!isInstructionTrustFor(key, record)) {
    throw new Error(`The trusted instructions for ${describeKey(key)} aren't valid.`);
  }
  return record;
}
