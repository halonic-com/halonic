import { KindedError, slugify, uniqueName } from "@halonicjs/std";
import type {
  AgentHub,
  AgentListing,
  AgentRef,
  AgentSettings,
  AgentsHost,
  AgentUser,
} from "./api.ts";

/** What {@link memoryAgentsHost} starts with. */
export interface MemoryAgentsHostOptions {
  readonly hubs: readonly AgentHub[];
  readonly agents?: readonly AgentListing[] | undefined;
  /** The workflows that run each agent, keyed by `hubId/id` of the agent. */
  readonly users?: Readonly<Record<string, readonly AgentUser[]>> | undefined;
}

/** The key a map uses for an agent. */
function keyOf(ref: AgentRef): string {
  return `${ref.hubId}/${ref.id}`;
}

/** What a row shows of an agent: its settings without the instructions. */
function listingOf({ instructions: _instructions, ...listing }: AgentSettings): AgentListing {
  return listing;
}

/**
 * An {@link AgentsHost} that keeps its agents in memory and tells its listeners about each change,
 * as the app's does. Tests of the Agents feature and of the features that read `referencesTo` use it.
 */
export function memoryAgentsHost(options: MemoryAgentsHostOptions): AgentsHost {
  const agents = new Map<string, AgentSettings>();
  for (const agent of options.agents ?? [])
    agents.set(keyOf(agent), { instructions: "", ...agent });
  const listeners = new Set<() => void>();

  const found = (ref: AgentRef): AgentSettings => {
    const agent = agents.get(keyOf(ref));
    if (agent === undefined) throw new KindedError("not_found", "This agent isn't there.");
    return agent;
  };

  return {
    hubs: () => options.hubs,
    list: async () => [...agents.values()].map(listingOf),
    read: async (ref) => listingOf(found(ref)),
    settings: async (ref) => found(ref),
    update: async (ref, change) => {
      const agent = found(ref);
      if (change.name !== undefined && change.name.trim() === "") {
        throw new KindedError("invalid_input", "An agent needs a name.");
      }
      const definite = Object.entries(change).filter(([, value]) => value !== undefined);
      agents.set(keyOf(ref), { ...agent, ...Object.fromEntries(definite) });
      for (const listener of listeners) listener();
    },
    nameOf: (ref) => agents.get(keyOf(ref))?.name,
    referencesTo: async (ref) => {
      found(ref);
      return options.users?.[keyOf(ref)] ?? [];
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    create: async ({ name, hubId }) => {
      if (!options.hubs.some((hub) => hub.id === hubId)) {
        throw new KindedError("not_found", "This hub isn't there.");
      }
      const taken = [...agents.values()]
        .filter((each) => each.hubId === hubId)
        .map((each) => each.id);
      const id = uniqueName(slugify(name), taken);
      agents.set(keyOf({ hubId, id }), { hubId, id, name, instructions: "" });
      for (const listener of listeners) listener();
      return { hubId, id };
    },
  };
}
