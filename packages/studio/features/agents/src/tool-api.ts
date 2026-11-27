/**
 * The Tools page's part of the host's API: the lists, the Library items they offer, and the keys
 * of the connectors' secrets. `api.ts` exports all of it.
 */
import type { SecretText } from "@halonicjs/studio-kit";

/** The lists of the Tools page: what an agent uses of the Library. */
export type AgentToolList = "skills" | "knowledge" | "connectors";

/** The Tools page's lists, in the order it shows them. */
export const agentToolLists: readonly AgentToolList[] = ["skills", "knowledge", "connectors"];

/** A Library item an agent can be given: its id, as the agent's file names it, and its name. */
export interface AgentToolOption {
  readonly id: string;
  readonly name: string;
  /**
   * For a connector: how many of its tools can run without a person's approval, by the engine's
   * rule (the ones `tools.read` marks as only reading); every other tool asks first, so 0 means
   * every tool does. Absent for a skill or knowledge.
   */
  readonly toolsWithoutAsking?: number | undefined;
  /**
   * For a connector: the names of the secrets its file names, in the file's order. Only the
   * names: the file holds a reference, and the values stay in the key store. Absent when it
   * names none.
   */
  readonly secrets?: readonly string[] | undefined;
}

/**
 * The key store as the Tools page uses it for the connectors' secrets (flow-agents 5.2, save
 * model 8.2). A key isn't versioned, so a change takes effect at once. Neither method returns a
 * key, and no error repeats one.
 */
export interface ConnectorKeys {
  /** Whether a key is stored under the secret's name. Rejects when the store can't be asked. */
  stored(secretName: string): Promise<boolean>;
  /** Stores the key under the secret's name, replacing the one there. Rejects when it can't. */
  change(secretName: string, key: SecretText): Promise<void>;
}

/** What a host offers for the connectors' secrets. */
export interface ConnectorKeysHost {
  /**
   * The keys of the connectors' secrets, for **Change key** on the Tools page. Absent where keys
   * can't be changed here, so the page shows the secrets by name only.
   */
  readonly connectorKeys?: ConnectorKeys | undefined;
}
