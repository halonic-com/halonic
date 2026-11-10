/** Version of the {@link AgentPlacementStore} port. A breaking change bumps it and comes with an ADR. */
export const agentPlacementStoreVersion = 1;

/** Which agent a placement is for. */
export interface AgentPlacementKey {
  /** The workspace's resolved real path, as in a `TrustRecord`. */
  location: string;
  /** The agent's id in the workspace. */
  agent: string;
}

/**
 * A person's choice to run one agent's harness on this computer, outside a
 * sandbox (requirement `ports.agent-placement-store`). Without a record, the
 * agent runs in a sandbox on this computer, so the default is the safe one.
 *
 * @example
 * const placement: AgentPlacementRecord = {
 *   location: "/workspaces/acme",
 *   agent: "coder",
 *   runsOn: "this-computer",
 *   agentFingerprint: "sha256:9f86d0…",
 *   chosenAt: "2026-11-09T10:00:00.000Z",
 * };
 */
export interface AgentPlacementRecord extends AgentPlacementKey {
  /** Where the person chose to run the agent. The only choice a record can hold. */
  runsOn: "this-computer";
  /**
   * The fingerprint of the agent's file when the person chose. When the file
   * changes, `AgentPlacement` in `core/app` treats the choice as not made
   * until the person confirms again.
   */
  agentFingerprint: string;
  /** When the person chose, as ISO text. */
  chosenAt: string;
}

/**
 * Each agent's "this computer" choice, in the user's profile next to the
 * trust records: the profile folder for the CLI and `serve`, the app data
 * folder for the desktop app, memory for tests and the browser demo. **Never
 * inside a workspace**, so an agent that edits the workspace can't take
 * itself out of its sandbox.
 *
 * The port only stores choices. `AgentPlacement` in `core/app` reads them,
 * checks the fingerprint and is what the engine asks. Only a person makes a
 * choice: no tool the model can call reaches this store.
 *
 * A record that exists but can't be read makes `get` throw, never return
 * `null`: the caller then runs the agent in a sandbox and tells the user why.
 * The error names the record's key, and `remove` still deletes it.
 */
export interface AgentPlacementStore {
  /** The choice for one agent, or `null` when there is none. */
  get(key: AgentPlacementKey): Promise<AgentPlacementRecord | null>;
  /** Saves a choice, replacing any with the same key. */
  save(placement: AgentPlacementRecord): Promise<void>;
  /**
   * Deletes the choice for one agent, even one that can't be read. Removing
   * a choice that isn't there is not an error.
   */
  remove(key: AgentPlacementKey): Promise<void>;
}

/** Every field of an {@link AgentPlacementRecord}, and no other. */
const placementFields = ["location", "agent", "runsOn", "agentFingerprint", "chosenAt"] as const;

/**
 * Whether `value`, as read back from a store, is a valid choice for `key`:
 * exactly the fields of an {@link AgentPlacementRecord}, each text, with
 * `runsOn: "this-computer"` and the key asked for. Anything else is a
 * damaged or borrowed choice, such as a hand edit or a file copied from
 * another agent, and must never take an agent out of its sandbox. Every
 * adapter checks what it reads with this, and `AgentPlacement` in
 * `core/app` checks what an adapter gives back with it again.
 *
 * @example
 * isAgentPlacementFor(key, JSON.parse(text)); // false for `{ ...record, sandbox: false }`
 */
export function isAgentPlacementFor(
  key: AgentPlacementKey,
  value: unknown,
): value is AgentPlacementRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as { readonly [field in (typeof placementFields)[number]]?: unknown };
  return (
    Object.keys(record).length === placementFields.length &&
    placementFields.every(
      (field) => Object.hasOwn(record, field) && typeof record[field] === "string",
    ) &&
    record.runsOn === "this-computer" &&
    record.location === key.location &&
    record.agent === key.agent
  );
}
