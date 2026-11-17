/**
 * The services and types other features may use. Features import each other only through this
 * file. The app provides `AgentsHostService` for each open workspace; the Agents feature's list,
 * dialogs and page read it, and the Workflows feature reads `referencesTo` for its "used by" line.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** Names one agent the way a deep link does: its hub and its id. */
export interface AgentRef {
  readonly hubId: string;
  readonly id: string;
}

/** What an agent's row on the Agents list shows. */
export interface AgentListing extends AgentRef {
  /** The display name; renaming changes it and keeps the id. */
  readonly name: string;
  /** What the agent is for, as its file says. The row shows it under the name, and the list search reads it. */
  readonly description?: string | undefined;
  /** The name of the model the agent uses, as its row shows it; absent when the file names none. */
  readonly model?: string | undefined;
}

/** A hub a new agent can go in. */
export interface AgentHub {
  readonly id: string;
  readonly name: string;
}

/** What the New agent dialog hands over. */
export interface NewAgent {
  readonly name: string;
  readonly hubId: string;
}

/** A workflow that runs an agent in one of its task steps. */
export interface AgentUser {
  readonly hubId: string;
  /** The workflow's id. */
  readonly id: string;
  /** The workflow's display name. */
  readonly name: string;
}

/**
 * The workspace's agents, as the app reads and changes them. The app saves to the workspace's files
 * itself, so listing and creating work while the engine is stopped.
 */
export interface AgentsHost {
  /** The hubs an agent can be created in, in the workspace's order. */
  hubs(): readonly AgentHub[];
  /** Every agent in the workspace's hubs. Rejects with the reason it couldn't read them. */
  list(): Promise<readonly AgentListing[]>;
  /** One agent's row. Rejects with the reason it couldn't be read, or with `not_found` when it isn't there. */
  read(ref: AgentRef): Promise<AgentListing>;
  /**
   * The name of an agent the host has read or made, for a tab or a page title, or `undefined`
   * before it has read it. Sync, because a tab is named the moment it opens.
   */
  nameOf(ref: AgentRef): string | undefined;
  /**
   * The workflows that run this agent in a task step, for the "used by" line and the warning
   * before a delete. Empty when none does. Rejects with the reason it couldn't read the workflows.
   */
  referencesTo(ref: AgentRef): Promise<readonly AgentUser[]>;
  /**
   * Calls `listener` each time the list may have changed (a file saved); returns the way to stop.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Makes an agent in the hub, with the id taken from its name (`-2` when the id is taken), and
   * returns where it is. Rejects with the reason it couldn't be written.
   */
  create(newAgent: NewAgent): Promise<AgentRef>;
}

/** The open workspace's agents, provided by the app (`agents.host`). */
export const AgentsHostService: ServiceKey<AgentsHost> = serviceKey<AgentsHost>("agents.host");
