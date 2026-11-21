import type { ChatAnswer } from "@halonicjs/app";
import { KindedError, slugify, uniqueName } from "@halonicjs/std";
import type {
  AgentChatRequest,
  AgentHarnessId,
  AgentHub,
  AgentListing,
  AgentLiveState,
  AgentModelParams,
  AgentModelParamsChange,
  AgentOutput,
  AgentPlacementState,
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
  SavedFilePlacement,
} from "./api.ts";
import { loopRefusal } from "./api.ts";

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
  /** What `liveState` answers for each agent, keyed by `hubId/id`; `live` when left out. */
  readonly liveStates?: Readonly<Record<string, AgentLiveState>> | undefined;
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
  /** `false` for a Studio that can't choose where agents run, such as the browser's; it can when left out. */
  readonly placement?: boolean | undefined;
  /** Gives the time a person chose On this computer, as ISO text; a fixed day when left out. */
  readonly now?: (() => string) | undefined;
  /** Whether an agent's file has unsaved changes, asked on each read; never when left out. */
  readonly unsaved?: ((ref: AgentRef) => boolean) | undefined;
  /** Whether this Studio can start an agent outside its sandbox; it can't when left out, as today. */
  readonly studioStartsUnfenced?: boolean | undefined;
}

/** A choice of On this computer: for the file with this fingerprint, at this time. */
interface ThisComputerRecord {
  readonly fingerprint: string;
  readonly chosenAt: string;
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
  // Each agent's file version, so a change gives it a new fingerprint as a saved edit does.
  const versions = new Map<string, number>();
  const choices = new Map<string, ThisComputerRecord>();
  const fingerprintOf = (ref: AgentRef) => `sha256:memory-${versions.get(keyOf(ref)) ?? 0}`;
  const canChoose = () => {
    if (options.placement === false) {
      throw new Error(
        "Halonic can't choose where agents run in the browser. Open this workspace in the desktop app to choose.",
      );
    }
  };

  const savedFilePlacement = (ref: AgentRef): SavedFilePlacement => {
    const fingerprint = fingerprintOf(ref);
    const chosen = choices.get(keyOf(ref));
    if (chosen === undefined) return { runsOn: "sandbox", fingerprint };
    if (chosen.fingerprint !== fingerprint) return { runsOn: "on-hold", fingerprint };
    return { runsOn: "this-computer", fingerprint, chosenAt: chosen.chosenAt };
  };

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
    const refusal = loopRefusal(teamOf(ref.hubId), ref.id, before, after);
    if (refusal !== undefined) throw new KindedError("conflict", refusal);
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
      versions.set(keyOf(ref), (versions.get(keyOf(ref)) ?? 0) + 1);
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
    liveState: async (ref) => {
      found(ref);
      return options.liveStates?.[keyOf(ref)] ?? "live";
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
    placement: async (ref): Promise<AgentPlacementState | undefined> => {
      found(ref);
      if (options.placement === false) return undefined;
      return {
        ...savedFilePlacement(ref),
        unsaved: options.unsaved?.(ref) ?? false,
        studioStartsUnfenced: options.studioStartsUnfenced ?? false,
      };
    },
    chooseThisComputer: async (ref, shownFingerprint) => {
      found(ref);
      canChoose();
      const fingerprint = fingerprintOf(ref);
      if (shownFingerprint !== fingerprint) return { saved: false, fingerprint };
      const chosenAt = options.now?.() ?? "2026-11-09T14:02:00.000Z";
      choices.set(keyOf(ref), { fingerprint, chosenAt });
      return { saved: true };
    },
    chooseSandbox: async (ref) => {
      found(ref);
      canChoose();
      choices.delete(keyOf(ref));
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
