import type {
  AgentPlacementKey,
  AgentPlacementRecord,
  AgentPlacementStore,
} from "@halonicjs/ports";

/**
 * Agent placements in memory, for tests and the browser demo (requirement
 * `memory.agent-placement-store`). Each placement is kept as JSON text, the
 * way a file in the user's profile would hold it, so every read gives a
 * fresh copy and a damaged placement can be modelled.
 */
export class MemoryAgentPlacementStore implements AgentPlacementStore {
  readonly #texts = new Map<string, string>();

  async get(key: AgentPlacementKey): Promise<AgentPlacementRecord | null> {
    const text = this.#texts.get(keyId(key));
    return text === undefined ? null : parsePlacement(key, text);
  }

  async save(placement: AgentPlacementRecord): Promise<void> {
    this.#texts.set(keyId(placement), JSON.stringify(placement));
  }

  async remove(key: AgentPlacementKey): Promise<void> {
    this.#texts.delete(keyId(key));
  }

  /**
   * For tests: makes the placement for `key` unreadable, as a damaged file
   * would be. `get` then throws, and `remove` and `save` still work.
   *
   * @throws when there is no placement for `key`, so a test can't create a
   *   damaged placement it never saved
   */
  damage(key: AgentPlacementKey): void {
    const id = keyId(key);
    if (!this.#texts.has(id)) {
      throw new Error(`There is no placement for ${describeKey(key)} to damage.`);
    }
    this.#texts.set(id, "{");
  }
}

/** One string per key. JSON keeps a location with a `/` from running into the agent id. */
function keyId(key: AgentPlacementKey): string {
  return JSON.stringify([key.location, key.agent]);
}

function describeKey(key: AgentPlacementKey): string {
  return `the agent ${JSON.stringify(key.agent)} in ${JSON.stringify(key.location)}`;
}

function parsePlacement(key: AgentPlacementKey, text: string): AgentPlacementRecord {
  try {
    return JSON.parse(text) as AgentPlacementRecord;
  } catch (error) {
    throw new Error(`The placement for ${describeKey(key)} can't be read.`, { cause: error });
  }
}
