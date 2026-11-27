import type {
  AgentHub,
  AgentListing,
  AgentSettings,
  AgentsHost,
} from "@halonicjs/studio-feature-agents/api";

/** What {@link madeUpAgentsHost} adds to its made-up agents. */
export interface MadeUpAgentsExtras extends Partial<AgentsHost> {
  /** Settings to put over an agent's defaults, by the agent's id. */
  readonly settingsOf?: Readonly<Record<string, Partial<AgentSettings>>>;
  /** The agents each one hands work to, by the agent's id; none when left out. */
  readonly subagentsOf?: Readonly<Record<string, readonly string[]>>;
}

/**
 * An agents host for the e2e pages, from made-up hubs and agents. It reads them and changes
 * nothing; `extras` puts in settings, subagents and other answers, such as the workflows that run
 * an agent.
 */
export function madeUpAgentsHost(
  hubs: readonly AgentHub[],
  agents: readonly AgentListing[],
  { settingsOf = {}, subagentsOf = {}, ...more }: MadeUpAgentsExtras = {},
): AgentsHost {
  const find = (ref: { readonly hubId: string; readonly id: string }) => {
    const found = agents.find((agent) => agent.hubId === ref.hubId && agent.id === ref.id);
    if (found === undefined) throw new Error("not found");
    return found;
  };
  return {
    hubs: () => hubs,
    list: async () => agents,
    read: async (ref) => find(ref),
    settings: async (ref) => {
      const found = find(ref);
      return {
        instructions: "",
        output: { type: "text" },
        maxSteps: 6,
        params: {},
        harness: "halonic",
        workingFolder: `files/agents/${found.id}`,
        allowedSites: [],
        skills: [],
        knowledge: [],
        connectors: [],
        subagents: subagentsOf[found.id] ?? [],
        agentSteps: [],
        ...found,
        ...settingsOf[found.id],
      };
    },
    update: async () => undefined,
    nameOf: (ref) => agents.find((agent) => agent.hubId === ref.hubId && agent.id === ref.id)?.name,
    modelAliases: async () => ["fast", "smart"],
    defaultModel: async () => "fast",
    toolOptions: async () => ({ skills: [], knowledge: [], connectors: [] }),
    addAgentStep: async (_ref, { name }) => name.toLowerCase(),
    team: async (ref) =>
      agents
        .filter((agent) => agent.hubId === ref.hubId)
        .map((agent) => ({ ...agent, subagents: subagentsOf[agent.id] ?? [] })),
    harnessReadiness: async () => ({ status: "ready", version: "1.0.0" }),
    openHarnessSignIn: async () => ({ opened: true }),
    answer: async () => ({ messages: [], end: { reason: "answered" } }),
    // A browser page, so where agents run can't be chosen here.
    placement: async () => undefined,
    chooseThisComputer: async () => {
      throw new Error("Halonic can't choose where agents run from here.");
    },
    chooseSandbox: async () => {
      throw new Error("Halonic can't choose where agents run from here.");
    },
    filePath: async (ref) => `hubs/${ref.hubId}/agents/${ref.id}.agent.yaml`,
    trash: async () => ({ undo: async () => undefined }),
    referencesTo: async () => [],
    subscribe: () => () => undefined,
    create: async ({ hubId, name }) => ({ hubId, id: name.toLowerCase() }),
    ...more,
  };
}
