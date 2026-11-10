import type {
  AgentPlacementKey,
  AgentPlacementRecord,
  AgentPlacementStore,
} from "@halonicjs/ports";

/**
 * A small in-memory `AgentPlacementStore` for the kernel's own tests, with a
 * way to make a choice unreadable. A deliberate fake: core may not use
 * adapters, not even in tests.
 */
export class TestAgentPlacementStore implements AgentPlacementStore {
  private readonly saved = new Map<string, AgentPlacementRecord>();
  private readonly unreadable = new Set<string>();
  /** Every record handed to `save`, as given, so a test can see what reached the store. */
  readonly saves: AgentPlacementRecord[] = [];

  async get(key: AgentPlacementKey): Promise<AgentPlacementRecord | null> {
    const id = keyId(key);
    if (this.unreadable.has(id)) {
      throw new Error(`the placement of ${id} can't be read`);
    }
    return this.saved.get(id) ?? null;
  }

  async save(placement: AgentPlacementRecord): Promise<void> {
    const id = keyId(placement);
    this.saves.push(placement);
    this.unreadable.delete(id);
    this.saved.set(id, { ...placement });
  }

  async remove(key: AgentPlacementKey): Promise<void> {
    const id = keyId(key);
    this.unreadable.delete(id);
    this.saved.delete(id);
  }

  /** Makes `get` throw for one agent until its placement is saved or removed. */
  breakPlacement(key: AgentPlacementKey): void {
    this.unreadable.add(keyId(key));
  }
}

/** One string per key. JSON keeps a location with a `/` from running into the agent id. */
function keyId(key: AgentPlacementKey): string {
  return JSON.stringify([key.location, key.agent]);
}
