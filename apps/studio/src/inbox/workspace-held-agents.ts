import type { RunSummary } from "@halonicjs/events";
import {
  type AgentListing,
  type AgentsHost,
  WHERE_IT_RUNS_STEP,
} from "@halonicjs/studio-feature-agents/api";
import type {
  HeldAgent,
  HeldAgentRef,
  HeldAgents,
  HeldAgentsList,
} from "@halonicjs/studio-feature-inbox/api";

/** What {@link WorkspaceHeldAgents} reads of the workspace's agents. */
export type HeldAgentsHost = Pick<
  AgentsHost,
  "list" | "placement" | "routinesOf" | "referencesTo" | "subscribe"
>;

/** What one agent's read came to: held, not held, or its choice couldn't be read. */
type AgentRead =
  | { readonly kind: "held"; readonly agent: HeldAgent }
  | { readonly kind: "not-held" }
  | { readonly kind: "unread"; readonly agent: HeldAgentRef };

/** What {@link WorkspaceHeldAgents} reads of the workspace's runs. */
export interface HeldAgentRuns {
  /** Every run of the workspace, real and test. */
  list(): Promise<readonly { readonly summary: RunSummary }[]>;
  /** Calls `listener` whenever a run starts, changes or ends; returns a function that stops it. */
  subscribe(listener: () => void): () => void;
}

/** What starts an agent: the keys of its own routines and the workflows that run it. */
export interface AgentStarters {
  /** Routine keys as a run's `trigger.routineId` holds them: `<hub>/<id>` or `@workspace/<id>`. */
  readonly routineKeys: ReadonlySet<string>;
  /** The workflows that run the agent in a step, by hub and id. */
  readonly workflows: readonly { readonly hubId: string; readonly id: string }[];
}

/**
 * The newest real routine run that started the agent after `heldSince`, or `undefined` when there is
 * none. A run started it when its routine is one of the agent's own, or when a routine started a
 * workflow that runs the agent. Without `heldSince` (the time the file changed isn't known) any such
 * run counts: the agent is on hold now, and that routine runs it in the sandbox.
 *
 * @example
 * newestScheduledRun(runs, starters, "2026-11-20T08:00:00.000Z"); // the 09:00 run of acme/daily
 */
export function newestScheduledRun(
  runs: readonly RunSummary[],
  starters: AgentStarters,
  heldSince: string | undefined,
): RunSummary | undefined {
  const startsAgent = (run: RunSummary) =>
    starters.routineKeys.has(run.trigger?.routineId ?? "") ||
    starters.workflows.some((flow) => flow.hubId === run.hubId && flow.id === run.workflowId);
  return runs
    .filter((run) => run.kind === "run" && run.trigger?.routineId !== undefined)
    .filter((run) => heldSince === undefined || run.startedAt > heldSince)
    .filter(startsAgent)
    .reduce<RunSummary | undefined>(
      (newest, run) => (newest === undefined || run.startedAt > newest.startedAt ? run : newest),
      undefined,
    );
}

/**
 * The agents the Inbox's on-hold rows list (requirement `studio.held-agents`): each agent whose On
 * this computer choice is on hold, once a routine ran it since its file changed. That run ran in the
 * sandbox, since the engine never lets a held agent out, so the run history says so without the
 * engine recording the hold. It reads the agents host and the run history and nothing else, and
 * tells the rows of a change to either, a saved Where it runs choice included. An agent whose choice
 * can't be read is named apart, so a row already listed for it keeps its state.
 *
 * @example
 * services.provide(HeldAgentsService, new WorkspaceHeldAgents(agentsHost, runs));
 */
export class WorkspaceHeldAgents implements HeldAgents {
  readonly #agents: HeldAgentsHost;
  readonly #runs: HeldAgentRuns;
  /** The card's **Review and confirm** opens the agent's page at Where it runs. */
  readonly reviewStep = WHERE_IT_RUNS_STEP;

  constructor(agents: HeldAgentsHost, runs: HeldAgentRuns) {
    this.#agents = agents;
    this.#runs = runs;
  }

  async list(): Promise<HeldAgentsList> {
    const scheduled = (await this.#runs.list())
      .map((run) => run.summary)
      .filter((run) => run.kind === "run" && run.trigger?.routineId !== undefined);
    // No routine ran anything: no agent can have a row, so no agent's choice is read.
    if (scheduled.length === 0) return { held: [], unread: [] };
    const agents = await this.#agents.list();
    const reads = await Promise.all(agents.map((agent) => this.#read(agent, scheduled)));
    return {
      held: reads.flatMap((read) => (read.kind === "held" ? [read.agent] : [])),
      unread: reads.flatMap((read) => (read.kind === "unread" ? [read.agent] : [])),
    };
  }

  subscribe(listener: () => void): () => void {
    const stops = [this.#agents.subscribe(listener), this.#runs.subscribe(listener)];
    return () => {
      for (const stop of stops) stop();
    };
  }

  async #read(agent: AgentListing, runs: readonly RunSummary[]): Promise<AgentRead> {
    // An agent whose choice can't be read gets no new row, as on the run controls: it runs in its
    // sandbox either way, and its Harness page says why the read failed. It is named apart, so a
    // row already listed for it keeps its state, and one broken file never hides the other agents'
    // rows behind an error.
    let placement: Awaited<ReturnType<HeldAgentsHost["placement"]>>;
    try {
      placement = await this.#agents.placement(agent);
    } catch {
      return { kind: "unread", agent: { hubId: agent.hubId, id: agent.id } };
    }
    if (placement?.runsOn !== "on-hold") return { kind: "not-held" };
    const run = newestScheduledRun(runs, await this.#startersOf(agent), placement.changedAt);
    if (run === undefined) return { kind: "not-held" };
    return {
      kind: "held",
      agent: { hubId: agent.hubId, id: agent.id, name: agent.name, since: run.startedAt },
    };
  }

  async #startersOf(agent: AgentListing): Promise<AgentStarters> {
    const [routines, workflows] = await Promise.all([
      this.#agents.routinesOf?.(agent) ?? [],
      this.#agents.referencesTo(agent),
    ]);
    return {
      routineKeys: new Set(
        routines.map((routine) => `${routine.hubId ?? "@workspace"}/${routine.id}`),
      ),
      workflows,
    };
  }
}
