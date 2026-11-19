import type { ChatAnswer } from "@halonicjs/app";
import { KindedError, slugify, uniqueName } from "@halonicjs/std";
import type {
  AgentChatRequest,
  AgentHarnessId,
  AgentHub,
  AgentListing,
  AgentRef,
  AgentSettings,
  AgentsHost,
  AgentToolList,
  AgentToolOption,
  AgentUser,
  HarnessReadiness,
} from "./api.ts";

/** What {@link memoryAgentsHost} starts with. */
export interface MemoryAgentsHostOptions {
  readonly hubs: readonly AgentHub[];
  readonly agents?:
    | readonly (AgentListing & {
        readonly instructions?: string;
        readonly maxSteps?: number;
        readonly harness?: AgentHarnessId;
        readonly skills?: readonly string[];
        readonly knowledge?: readonly string[];
        readonly connectors?: readonly string[];
      })[]
    | undefined;
  /** What `harnessReadiness` answers for Claude Code and Codex; ready when left out. */
  readonly readiness?: Readonly<Partial<Record<AgentHarnessId, HarnessReadiness>>> | undefined;
  /** The model aliases every hub can use. */
  readonly modelAliases?: readonly string[] | undefined;
  /** The model an agent without one uses; none when left out. */
  readonly defaultModel?: string | undefined;
  /** The Library items every hub can use; none when left out. */
  readonly toolOptions?:
    | Readonly<Partial<Record<AgentToolList, readonly AgentToolOption[]>>>
    | undefined;
  /**
   * How `answer` answers a Try it message; by default the agent says "Done." and the answer ends.
   * A test that drives a chat step by step gives its own.
   */
  readonly answer?: ((ref: AgentRef, request: AgentChatRequest) => Promise<ChatAnswer>) | undefined;
  /** The workflows that run each agent, keyed by `hubId/id` of the agent. */
  readonly users?: Readonly<Record<string, readonly AgentUser[]>> | undefined;
  /**
   * The workspace's trust, for Try it: whether it may start now, the gate a test answers, and the
   * workspace's name. Left out, there is no folder to trust and every message may start.
   */
  readonly trust?:
    | {
        readonly mayStart: () => boolean;
        readonly ask?: (() => Promise<"trusted" | "declined">) | undefined;
        readonly workspaceName?: string | undefined;
      }
    | undefined;
}

/** The key a map uses for an agent. */
function keyOf(ref: AgentRef): string {
  return `${ref.hubId}/${ref.id}`;
}

/** What a row shows of an agent: its settings without the instructions. */
function listingOf({
  instructions: _instructions,
  maxSteps: _maxSteps,
  harness: _harness,
  skills: _skills,
  knowledge: _knowledge,
  connectors: _connectors,
  ...listing
}: AgentSettings): AgentListing {
  return listing;
}

/** The settings an agent has before anyone changes them. */
const fresh = {
  instructions: "",
  maxSteps: 6,
  harness: "halonic",
  skills: [],
  knowledge: [],
  connectors: [],
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
    harnessReadiness: async (ref, harness) => {
      found(ref);
      return harness === "halonic"
        ? { status: "ready", version: "" }
        : (options.readiness?.[harness] ?? { status: "ready", version: "1.0.0" });
    },
    answer: async (ref, request) => {
      found(ref);
      if (options.answer !== undefined) return options.answer(ref, request);
      const message = { role: "assistant", content: "Done." } as const;
      request.listener?.onMessage?.(message);
      return { messages: [message], end: { reason: "answered" } };
    },
    ...(options.trust && {
      mayStart: options.trust.mayStart,
      ...(options.trust.ask && { askTrust: options.trust.ask }),
      workspaceName: () => options.trust?.workspaceName,
    }),
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
