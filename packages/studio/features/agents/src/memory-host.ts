import { KindedError, slugify, uniqueName } from "@halonicjs/std";
import type {
  AgentHarnessId,
  AgentHub,
  AgentListing,
  AgentModelParams,
  AgentModelParamsChange,
  AgentOutput,
  AgentRef,
  AgentSettings,
  AgentStep,
  AgentsHost,
  AgentTeamMember,
  AgentToolList,
  AgentToolOption,
  AgentUser,
  HarnessReadiness,
  HarnessSignIn,
} from "./api.ts";
import { alreadyHandsWork, handOffPath } from "./api.ts";

/** What {@link memoryAgentsHost} starts with. */
export interface MemoryAgentsHostOptions {
  readonly hubs: readonly AgentHub[];
  readonly agents?:
    | readonly (AgentListing & {
        readonly instructions?: string;
        readonly output?: AgentOutput;
        readonly maxSteps?: number;
        readonly params?: AgentModelParams;
        readonly harness?: AgentHarnessId;
        readonly skills?: readonly string[];
        readonly knowledge?: readonly string[];
        readonly connectors?: readonly string[];
        readonly subagents?: readonly string[];
        readonly agentSteps?: readonly AgentStep[];
      })[]
    | undefined;
  /** What `harnessReadiness` answers for Claude Code and Codex; ready when left out. */
  readonly readiness?: Readonly<Partial<Record<AgentHarnessId, HarnessReadiness>>> | undefined;
  /** What `openHarnessSignIn` answers; a terminal opened when left out. */
  readonly signIn?: HarnessSignIn | undefined;
  /** The model aliases every hub can use. */
  readonly modelAliases?: readonly string[] | undefined;
  /** The model an agent without one uses; none when left out. */
  readonly defaultModel?: string | undefined;
  /** The Library items every hub can use; none when left out. */
  readonly toolOptions?:
    | Readonly<Partial<Record<AgentToolList, readonly AgentToolOption[]>>>
    | undefined;
  /** The workflows that run each agent, keyed by `hubId/id` of the agent. */
  readonly users?: Readonly<Record<string, readonly AgentUser[]>> | undefined;
}

/** The key a map uses for an agent. */
function keyOf(ref: AgentRef): string {
  return `${ref.hubId}/${ref.id}`;
}

/** What a row shows of an agent: its settings without the instructions. */
function listingOf({
  instructions: _instructions,
  output: _output,
  maxSteps: _maxSteps,
  params: _params,
  harness: _harness,
  skills: _skills,
  knowledge: _knowledge,
  connectors: _connectors,
  subagents: _subagents,
  agentSteps: _agentSteps,
  ...listing
}: AgentSettings): AgentListing {
  return listing;
}

/** The model settings after a change: a value sets one, `null` takes it out. */
function changedParams(params: AgentModelParams, change: AgentModelParamsChange): AgentModelParams {
  const next: Record<string, unknown> = { ...params };
  for (const [key, value] of Object.entries(change)) {
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  return next;
}

/** The settings an agent has before anyone changes them. */
const fresh = {
  instructions: "",
  output: { type: "text" },
  maxSteps: 6,
  params: {},
  harness: "halonic",
  skills: [],
  knowledge: [],
  connectors: [],
  subagents: [],
  agentSteps: [],
} as const;

/**
 * An {@link AgentsHost} that keeps its agents in memory and tells its listeners about each change,
 * as the app's does. Tests of the Agents feature and of the features that read `referencesTo` use it.
 */
export function memoryAgentsHost(options: MemoryAgentsHostOptions): AgentsHost {
  const agents = new Map<string, AgentSettings>();
  for (const agent of options.agents ?? []) agents.set(keyOf(agent), { ...fresh, ...agent });
  const listeners = new Set<() => void>();

  const found = (ref: AgentRef): AgentSettings => {
    const agent = agents.get(keyOf(ref));
    if (agent === undefined) throw new KindedError("not_found", "This agent isn't there.");
    return agent;
  };

  const teamOf = (hubId: string): AgentTeamMember[] =>
    [...agents.values()]
      .filter((each) => each.hubId === hubId)
      .map((each) => ({ ...listingOf(each), subagents: each.subagents }))
      .sort((a, b) => a.name.localeCompare(b.name));

  /** Rejects a new subagent that already hands work back to this agent, as the app's host does. */
  const refuseLoops = (ref: AgentRef, before: readonly string[], after: readonly string[]) => {
    const team = teamOf(ref.hubId);
    for (const id of after.filter((each) => !before.includes(each))) {
      const path = handOffPath(team, id, ref.id);
      if (path !== undefined) {
        const names = path.map((each) => team.find((member) => member.id === each)?.name ?? each);
        throw new KindedError("conflict", `${alreadyHandsWork(names)}; that would be a loop.`);
      }
    }
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
      if (change.subagents !== undefined) refuseLoops(ref, agent.subagents, change.subagents);
      if (change.output?.type === "choice" && change.output.options.length === 0) {
        throw new KindedError("invalid_input", "A list of options needs at least one.");
      }
      const { params, ...fields } = change;
      const definite = Object.entries(fields).filter(([, value]) => value !== undefined);
      agents.set(keyOf(ref), {
        ...agent,
        ...Object.fromEntries(definite),
        params: params === undefined ? agent.params : changedParams(agent.params, params),
      });
      for (const listener of listeners) listener();
    },
    modelAliases: async (ref) => {
      found(ref);
      return options.modelAliases ?? [];
    },
    defaultModel: async () => options.defaultModel,
    toolOptions: async (ref) => {
      found(ref);
      const { skills = [], knowledge = [], connectors = [] } = options.toolOptions ?? {};
      return { skills, knowledge, connectors };
    },
    addAgentStep: async (ref, { name, instructions }) => {
      const agent = found(ref);
      if (name.trim() === "" || instructions.trim() === "") {
        throw new KindedError("invalid_input", "An agent step needs a name and instructions.");
      }
      const id = uniqueName(
        slugify(name),
        agent.agentSteps.map((step) => step.id),
      );
      agents.set(keyOf(ref), { ...agent, agentSteps: [...agent.agentSteps, { id, instructions }] });
      for (const listener of listeners) listener();
      return id;
    },
    team: async (ref) => {
      found(ref);
      return teamOf(ref.hubId);
    },
    harnessReadiness: async (ref, harness) => {
      found(ref);
      return harness === "halonic"
        ? { status: "ready", version: "" }
        : (options.readiness?.[harness] ?? { status: "ready", version: "1.0.0" });
    },
    openHarnessSignIn: async (ref) => {
      found(ref);
      return options.signIn ?? { opened: true };
    },
    filePath: async (ref) => {
      found(ref);
      return `hubs/${ref.hubId}/agents/${ref.id}.agent.yaml`;
    },
    trash: async (ref) => {
      const agent = found(ref);
      agents.delete(keyOf(ref));
      for (const listener of listeners) listener();
      let newest = true;
      return {
        // Like the app's: the delete has to be the newest change to be undone.
        undo: async () => {
          if (!newest || agents.has(keyOf(ref))) {
            throw new KindedError("conflict", `${agent.name} can't be put back.`);
          }
          newest = false;
          agents.set(keyOf(ref), agent);
          for (const listener of listeners) listener();
        },
      };
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
    create: async ({ name, hubId, instructions }) => {
      if (!options.hubs.some((hub) => hub.id === hubId)) {
        throw new KindedError("not_found", "This hub isn't there.");
      }
      const taken = [...agents.values()]
        .filter((each) => each.hubId === hubId)
        .map((each) => each.id);
      const id = uniqueName(slugify(name), taken);
      agents.set(keyOf({ hubId, id }), {
        ...fresh,
        hubId,
        id,
        name,
        instructions: instructions ?? "",
      });
      for (const listener of listeners) listener();
      return { hubId, id };
    },
  };
}
