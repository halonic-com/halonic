import {
  keptWaitingVersions,
  type ToolApproval,
  type ToolApprovalKey,
  type ToolApprovalStore,
  UnreadableToolApprovalError,
  type WaitingVersion,
} from "@halonicjs/ports";

/** What one source in one workspace holds: approvals as JSON text, and waiting versions. */
interface SourceEntries {
  approvals: Map<string, string>;
  waiting: Map<string, WaitingVersion[]>;
}

/**
 * Listed tool approvals in memory, for tests and the browser demo. Each
 * approval is kept as JSON text, the way a file in the user's profile would
 * hold it, so every read gives a fresh copy and a damaged approval can be
 * modelled. Keys stay structured, in nested `Map`s by location, source and
 * name, so no key can collide with another or with an object's own
 * properties.
 */
export class MemoryToolApprovalStore implements ToolApprovalStore {
  readonly #locations = new Map<string, Map<string, SourceEntries>>();

  async get(key: ToolApprovalKey): Promise<ToolApproval | null> {
    const text = this.#source(key).approvals.get(key.name);
    return text === undefined ? null : parseApproval(key, text);
  }

  async approve(approval: ToolApproval): Promise<void> {
    const source = this.#source(approval);
    source.approvals.set(approval.name, JSON.stringify(approval));
    source.waiting.delete(approval.name);
  }

  async revoke(key: ToolApprovalKey): Promise<void> {
    const source = this.#source(key);
    source.approvals.delete(key.name);
    source.waiting.delete(key.name);
  }

  async list(location: string, source: string): Promise<ToolApproval[]> {
    const { approvals } = this.#source({ location, source });
    // Names are unique keys, so the order never has to break a tie.
    const entries = [...approvals].sort(([a], [b]) => (a < b ? -1 : 1));
    return entries.map(([name, text]) => parseApproval({ location, source, name }, text));
  }

  async noteWaiting(key: ToolApprovalKey, version: WaitingVersion): Promise<WaitingVersion[]> {
    const source = this.#source(key);
    const kept = keptWaitingVersions(source.waiting, key.name, version);
    source.waiting = kept.waiting;
    return kept.versions;
  }

  /**
   * For tests: makes the approval for `key` unreadable, as a damaged file
   * would be. `get` and `list` then throw, and `revoke` still deletes it.
   *
   * @throws when there is no approval for `key`, so a test can't create a
   *   damaged approval it never made
   */
  damage(key: ToolApprovalKey): void {
    const { approvals } = this.#source(key);
    if (!approvals.has(key.name)) {
      throw new Error(`There is no approval for ${describeKey(key)} to damage.`);
    }
    approvals.set(key.name, "{");
  }

  #source(key: Omit<ToolApprovalKey, "name">): SourceEntries {
    let sources = this.#locations.get(key.location);
    if (sources === undefined) {
      sources = new Map();
      this.#locations.set(key.location, sources);
    }
    let entries = sources.get(key.source);
    if (entries === undefined) {
      entries = { approvals: new Map(), waiting: new Map() };
      sources.set(key.source, entries);
    }
    return entries;
  }
}

function parseApproval(key: ToolApprovalKey, text: string): ToolApproval {
  try {
    return JSON.parse(text) as ToolApproval;
  } catch (error) {
    throw new UnreadableToolApprovalError(
      key,
      key.name,
      `The approval for ${describeKey(key)} can't be read.`,
      { cause: error },
    );
  }
}

/** A key as people read it, such as `tool "lookup" of "notes" in "/workspaces/acme"`. */
function describeKey(key: ToolApprovalKey): string {
  return `tool ${JSON.stringify(key.name)} of ${JSON.stringify(key.source)} in ${JSON.stringify(key.location)}`;
}
