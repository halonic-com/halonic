import type { RunSummary } from "@halonicjs/events";
import type { AgentListing, AgentsHost } from "@halonicjs/studio-feature-agents/api";
import type { HeldAgent, HeldAgents } from "@halonicjs/studio-feature-inbox/api";

/** What {@link WorkspaceHeldAgents} reads of the workspace's agents. */
export type HeldAgentsHost = Pick<
  AgentsHost,
  "list" | "placement" | "routinesOf" | "referencesTo" | "subscribe"
>;

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
 * tells the rows of a change to either, a saved Where it runs choice included.
 *
 * @example
 * services.provide(HeldAgentsService, new WorkspaceHeldAgents(agentsHost, runs));
 */
export class WorkspaceHeldAgents implements HeldAgents {
  readonly #agents: HeldAgentsHost;
  readonly #runs: HeldAgentRuns;

  constructor(agents: HeldAgentsHost, runs: HeldAgentRuns) {
    this.#agents = agents;
    this.#runs = runs;
  }

  async list(): Promise<readonly HeldAgent[]> {
    const scheduled = (await this.#runs.list())
      .map((run) => run.summary)
      .filter((run) => run.kind === "run" && run.trigger?.routineId !== undefined);
    // No routine ran anything: no agent can have a row, so no agent's choice is read.
    if (scheduled.length === 0) return [];
    const agents = await this.#agents.list();
    const held = await Promise.all(agents.map((agent) => this.#heldAgent(agent, scheduled)));
    return held.filter((agent) => agent !== undefined);
  }

  subscribe(listener: () => void): () => void {
    const stops = [this.#agents.subscribe(listener), this.#runs.subscribe(listener)];
    return () => {
      for (const stop of stops) stop();
    };
  }

  async #heldAgent(
    agent: AgentListing,
    runs: readonly RunSummary[],
  ): Promise<HeldAgent | undefined> {
    // An agent whose choice can't be read isn't on hold here, as on the run controls: it runs in its
    // sandbox either way, and its Harness page says why the read failed. One broken file then never
    // hides the other agents' rows behind an error.
    const placement = await this.#agents.placement(agent).catch(() => undefined);
    if (placement?.runsOn !== "on-hold") return undefined;
    const run = newestScheduledRun(runs, await this.#startersOf(agent), placement.changedAt);
    if (run === undefined) return undefined;
    return { hubId: agent.hubId, id: agent.id, name: agent.name, since: run.startedAt };
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
