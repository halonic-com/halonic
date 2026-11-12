import type { RunEvent, RunVersion } from "@halonicjs/events";
import type {
  Agent,
  Collection,
  Connector,
  KnowledgeSource,
  Skill,
  Workflow,
} from "@halonicjs/format";
import type {
  ChatParams,
  ChatResponse,
  Clock,
  ConnectorClient,
  RecordStore,
  ScheduledTimer,
} from "@halonicjs/ports";
import { fixedIds } from "@halonicjs/std";
import { secretsWith, steppingClock } from "../agent/turn-test-kit.test-helper.ts";
import type { HalonicTool } from "../agent/turn-tools.ts";
import type { Budget } from "../budget/budget.ts";
import type { HarnessRunsOptions } from "../harness/harness-host.ts";
import { NotingScheduler } from "../harness/harness-test-kit.test-helper.ts";
import {
  KernelBlobs,
  KernelRuns,
  replyWorkflow,
  writerAgent,
} from "../kernel/kernel-test-kit.test-helper.ts";
import type { AgentKnowledgeOptions } from "../knowledge/agent-knowledge.ts";
import { LocalExecutor } from "../local-executor.ts";
import { ScriptedModel } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import type { RunProposalFolders } from "./proposal-folders.ts";

/**
 * Timers in a map that a test delivers with {@link TestScheduler.runDue},
 * ignoring their times: the run tests are about the order of steps, not
 * the clock.
 */
export class TestScheduler extends NotingScheduler {
  onTimer: (timer: ScheduledTimer) => Promise<void> = async () => {};

  /**
   * Delivers every timer set until none is left, each `times` times at once,
   * as a platform that delivers twice would.
   */
  async runDue(times = 1): Promise<void> {
    while (this.timers.size > 0) {
      const due = [...this.timers.values()];
      this.timers.clear();
      for (const timer of due) {
        await Promise.all(Array.from({ length: times }, () => this.onTimer({ ...timer })));
      }
    }
  }

  /**
   * Delivers one timer once it is set, and resolves when its delivery has.
   * A test uses it to deliver a timer while another delivery still runs.
   */
  async deliver(key: string, timerId: string): Promise<void> {
    const timer = await this.waitFor(key, timerId);
    await this.cancel(key, timerId);
    await this.onTimer({ ...timer });
  }
}

/**
 * A run store whose next read of a log can be held: it reads the log at
 * once, but gives it back only when the test releases it, as a slow disk
 * would after another write has landed.
 */
export class HeldRuns extends KernelRuns {
  #held: Promise<void> | undefined;

  /** Holds the next `events` read; call the returned function to release it. */
  holdNextRead(): () => void {
    let release = () => {};
    this.#held = new Promise((resolve) => {
      release = resolve;
    });
    return release;
  }

  override async events(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    const events = await super.events(runId, afterSeq);
    const held = this.#held;
    this.#held = undefined;
    if (held !== undefined) await held;
    return events;
  }
}

/** What a test can change about {@link runsOn}'s executor. */
export interface RunsSetup {
  /** The one workflow the hub has; the reply workflow when left out. */
  readonly workflow?: Workflow;
  /** A clock that moves on 250 ms per reading when left out. */
  readonly clock?: Clock;
  /** The hub's agents, which chat turns also find; none when left out. */
  readonly agents?: Readonly<Record<string, Agent>>;
  /** The ports for its agents' harness runs; none when left out. */
  readonly harnesses?: HarnessRunsOptions;
  /** The executor's Halonic tools; none when left out. */
  readonly halonicTools?: readonly HalonicTool[];
  /** Where agents keep their notes; no memory tools when left out. */
  readonly memory?: RecordStore;
  /** The hub's other workflows, which its `workflow` states run; none when left out. */
  readonly workflows?: Readonly<Record<string, Workflow>>;
  /** The collections the hub can see; none when left out. */
  readonly collections?: Readonly<Record<string, Collection>>;
  /** Where runs keep their definitions; new and empty when left out. Share it to restart on the same store. */
  readonly blobs?: KernelBlobs;
  /** The workspace's budget; none when left out. */
  readonly budget?: Budget;
  /** The connected servers; none when left out. */
  readonly connectors?: readonly ConnectorClient[];
  /**
   * The `tools` lists of the connector files the hub can see, by id; a file
   * with no `allow` for each of `connectors` when left out.
   */
  readonly connectorTools?: Readonly<Record<string, Connector["tools"]>>;
  /** The knowledge sources the hub can see; none when left out. */
  readonly knowledge?: Readonly<Record<string, KnowledgeSource>>;
  /** The skills the hub can see; none when left out. */
  readonly skills?: Readonly<Record<string, Skill>>;
  /** How the executor builds agents' knowledge sources; it builds none when left out. */
  readonly knowledgeOptions?: AgentKnowledgeOptions;
  /** What runs need to reach the connectors; runs offer none of their tools when left out. */
  readonly connectorCalls?: RunConnectorCalls;
  /** The proposal folders of top-level runs; runs get none when left out. */
  readonly proposalFolders?: RunProposalFolders;
  /** The params of the alias the scripted model answers as; none when left out. */
  readonly aliasParams?: ChatParams;
}

/** A local executor with runs on memory ports, a scripted model and one workflow. */
export function runsOn<Runs extends KernelRuns = KernelRuns>(
  answers: (ChatResponse | Error)[],
  runs: Runs = new KernelRuns() as Runs,
  setup: RunsSetup = {},
) {
  const {
    workflow = replyWorkflow,
    clock = steppingClock(),
    agents,
    harnesses,
    workflows,
    collections,
    knowledge,
    skills,
    blobs = new KernelBlobs(),
  } = setup;
  const connectorTools =
    setup.connectorTools ??
    Object.fromEntries((setup.connectors ?? []).map(({ id }) => [id, { approve: [] }]));
  const model = new ScriptedModel(answers);
  const scheduler = new TestScheduler();
  const definitionsAsked: string[] = [];
  const versionsAsked: (RunVersion | undefined)[] = [];
  const executor = new LocalExecutor({
    resolveModel: async () => ({
      provider: model,
      model: "scripted-1",
      ...(setup.aliasParams === undefined ? {} : { params: setup.aliasParams }),
    }),
    halonicTools: setup.halonicTools ?? [],
    ...(setup.memory === undefined ? {} : { memory: setup.memory }),
    connectors: setup.connectors ?? [],
    ...(setup.knowledgeOptions === undefined ? {} : { knowledge: setup.knowledgeOptions }),
    secrets: secretsWith(),
    clock,
    chatAgentOf: async ({ agentId }) =>
      agentId !== undefined && agents !== undefined && Object.hasOwn(agents, agentId)
        ? agents[agentId]
        : undefined,
    runs: {
      store: runs,
      blobs,
      scheduler,
      ids: fixedIds(),
      ...(harnesses === undefined ? {} : { harnesses }),
      ...(setup.budget === undefined ? {} : { budget: async () => setup.budget }),
      ...(setup.connectorCalls === undefined ? {} : { connectorCalls: setup.connectorCalls }),
      ...(setup.proposalFolders === undefined ? {} : { proposalFolders: setup.proposalFolders }),
      definitionsOf: async (hubId, workflowId, version) => {
        definitionsAsked.push(`${hubId}/${workflowId}`);
        versionsAsked.push(version);
        if (workflowId !== workflow.id) throw new Error(`No workflow "${workflowId}".`);
        return {
          workflow,
          ...(agents === undefined ? {} : { agents }),
          ...(workflows === undefined ? {} : { workflows }),
          ...(collections === undefined ? {} : { collections }),
          ...(knowledge === undefined ? {} : { knowledge }),
          ...(skills === undefined ? {} : { skills }),
          connectorTools,
        };
      },
    },
  });
  scheduler.onTimer = (timer) => executor.onTimer(timer);
  return { executor, model, runs, blobs, scheduler, definitionsAsked, versionsAsked };
}

/**
 * Agents of the `acme` hub with the writer's defaults, each of whose file
 * lists `connectors`: what a run's agent needs to be offered their tools.
 *
 * @example
 * runsOn(answers, runs, { agents: agentsUsing(["mail"], "writer"), connectors: [mail], connectorCalls });
 */
export function agentsUsing(
  connectors: readonly string[],
  ...ids: readonly string[]
): Record<string, Agent> {
  return Object.fromEntries(
    ids.map((id) => [id, { ...writerAgent(), id, name: id, connectors: [...connectors] }]),
  );
}

/** A start of the reply workflow in the `acme` hub. */
export const replyStart = { hubId: "acme", workflowId: "reply", input: { from: "support" } };

/** The types of a run's events, in order. */
export function typesOf(events: readonly RunEvent[] | undefined): string[] {
  return (events ?? []).map((event) => event.type);
}
