// The executor that runs the engine in this process: chat turns, and with
// `runs` set, workflow runs through the run kernel.

import type { RunSummary } from "@halonicjs/events";
import type { Agent } from "@halonicjs/format";
import type {
  ChatTurnRequest,
  ChatTurnResponse,
  Clock,
  ConnectorClient,
  RecordStore,
  RunEventListener,
  RunExecutor,
  RunSubscription,
  ScheduledTimer,
  Secrets,
  SendOptions,
  StartRunRequest,
} from "@halonicjs/ports";
import { checkRunToolCall, checkSubagentToolCall } from "./agent/check-run-tool-call.ts";
import type { ResolvedModel } from "./agent/model-chain.ts";
import { runAgentTurn, runModelTurn } from "./agent/run-model-turn.ts";
import type { HalonicTool } from "./agent/turn-tools.ts";
import type { ModelCallResult, RunDefinitions } from "./kernel/decide-types.ts";
import { missingDefinitionsError, readDefinitions } from "./kernel/kept-definitions.ts";
import type { PendingCall, RunState } from "./kernel/run-state.ts";
import { LocalRuns, type LocalRunsOptions } from "./run/local-runs.ts";
import { runAgentTools } from "./run/run-agent-tools.ts";
import { AgentMemory } from "./tools/agent-memory/agent-memory.ts";
import { memoryTools } from "./tools/agent-memory/memory-tools.ts";
import type { DelegatedTask } from "./tools/subagents/subagent-tools.ts";

/** What a {@link LocalExecutor} works with. Everything comes in here: no registry, no adapters. */
export interface LocalExecutorOptions {
  /**
   * Picks the model of a chat turn from its request: `alias`, `agentId` and
   * the unsaved `agent` settings, with the alias's own fallbacks. The
   * workspace package plugs in here once it has model aliases.
   *
   * @throws when no model fits; `chatTurn` then rejects with that error
   */
  resolveModel(request: ChatTurnRequest): Promise<ResolvedModel>;
  /** Halonic's own tools, offered after the caller's. */
  readonly halonicTools: readonly HalonicTool[];
  /**
   * Where agents keep their notes and their collections' records. With it,
   * a run's model call, and a chat turn that names an agent, also offer that
   * agent's memory tools, after the other Halonic tools; and a run's agent
   * with `collections` gets its records tools.
   */
  readonly memory?: RecordStore;
  /** The connected servers, whose tools are offered last. */
  readonly connectors: readonly ConnectorClient[];
  /** Where a turn checks that a model's key is set, to skip the model before calling it when it isn't. */
  readonly secrets: Secrets;
  readonly clock: Clock;
  /** The most model calls one chat turn makes; 20 when left out. */
  readonly maxRounds?: number;
  /** What runs need. Without it, the executor runs chat turns only and refuses runs. */
  readonly runs?: LocalRunsOptions;
}

/** The round limit of a chat turn when the options don't set one. */
export const defaultMaxRounds = 20;

/**
 * The round limit of a run's model call when the run's definitions have no
 * file for its agent: the format's default for an agent's `maxSteps`.
 */
export const defaultRunMaxRounds = 6;

/** The agent name a chat turn's model calls carry when the request names none. */
const chatAgent = "chat";

/** The run and state a run's model call is for, with the definitions the run started with. */
interface RunTurn {
  readonly run: RunState;
  readonly state: string;
  readonly definitions: RunDefinitions;
}

/**
 * The {@link RunExecutor} that runs the engine in this process. It runs chat
 * turns, and with {@link LocalExecutorOptions.runs} it starts workflow runs,
 * sends them events and streams their events. `startAgent` refuses until
 * agent runs are built (step 4).
 *
 * A run moves on one step per scheduler timer, so the scheduler's listener
 * must forward its timers to {@link LocalExecutor.onTimer}. Before the first
 * run starts or resumes, the executor ends the runs it lost when it last
 * stopped (`endInterruptedRuns`); it assumes it is the only engine on its store.
 */
export class LocalExecutor implements RunExecutor {
  readonly id = "local";
  private readonly options: LocalExecutorOptions;
  private readonly maxRounds: number;
  private readonly runs: LocalRuns | undefined;

  /**
   * @throws RangeError when `maxRounds` is less than 1 or not a whole number, or a start
   *   limit in `runs.harnesses` isn't a whole number of milliseconds of 1 or more
   */
  constructor(options: LocalExecutorOptions) {
    const maxRounds = options.maxRounds ?? defaultMaxRounds;
    if (!Number.isInteger(maxRounds) || maxRounds < 1) {
      throw new RangeError(`maxRounds must be a whole number of 1 or more, not ${maxRounds}.`);
    }
    this.options = options;
    this.maxRounds = maxRounds;
    this.runs =
      options.runs === undefined
        ? undefined
        : new LocalRuns(options.runs, options.clock, (run, call) => this.callModel(run, call));
  }

  /**
   * Records the start of a run and returns; the run goes on from timers. A
   * repeated `runId` returns the existing run.
   *
   * @throws RangeError when `runId` is longer than 256 UTF-8 bytes
   * @throws when the hub or workflow doesn't exist, or the executor has no `runs`
   */
  start(request: StartRunRequest): Promise<RunSummary> {
    return this.runs === undefined ? Promise.reject(noRuns()) : this.runs.start(request);
  }

  startAgent(): Promise<RunSummary> {
    return Promise.reject(
      new Error("The local executor can't start agent runs yet; they come with the agent loop."),
    );
  }

  /**
   * Records an event sent to a waiting run and returns.
   *
   * @throws InputRefused when the run doesn't exist or doesn't take the event now
   */
  send(
    runId: string,
    event: string,
    payload?: unknown,
    options?: SendOptions,
  ): Promise<RunSummary> {
    return this.runs === undefined
      ? Promise.reject(noRuns())
      : this.runs.send(runId, event, payload, options);
  }

  /** As the port asks, it doesn't throw: the listener's `onClose` gets any error after this returns. */
  subscribe(runId: string, afterSeq: number, listener: RunEventListener): RunSubscription {
    if (this.runs !== undefined) {
      return this.runs.subscribe(runId, afterSeq, listener);
    }
    let open = true;
    void Promise.resolve().then(() => {
      if (open) {
        listener.onClose(noRuns());
      }
    });
    return {
      close: () => {
        open = false;
      },
    };
  }

  /**
   * A run's timer is due. The scheduler's listener calls this. A late or
   * repeated timer changes nothing. Without `runs` there are no timers.
   */
  async onTimer(timer: ScheduledTimer): Promise<void> {
    await this.runs?.onTimer(timer);
  }

  /**
   * Stops the engine's work in this process. It stops every harness run,
   * then its sandbox session, then its bridge, and resolves once all three
   * have stopped; a session that opens after that is closed as it opens.
   * Harness runs that were going end as `interrupted` when an engine next
   * starts on the same store. Timers delivered after this change nothing.
   * `localEngine`'s `close` calls it before it closes the scheduler.
   */
  async close(): Promise<void> {
    await this.runs?.close();
  }

  /**
   * Runs one chat turn with the caller's tools, Halonic's tools and the
   * connected servers' tools. It keeps no run log, because a chat turn
   * belongs to no run: the models it skipped are in `skipped` instead.
   *
   * @throws when no model fits the request
   * @throws {ModelCallError} when no model is left, or with the reason the model gave for any other failure
   */
  async chatTurn(request: ChatTurnRequest): Promise<ChatTurnResponse> {
    return runModelTurn({
      model: await this.options.resolveModel(request),
      secrets: this.options.secrets,
      messages: request.messages,
      callerTools: request.tools,
      halonicTools: this.halonicToolsOf(request.agentId),
      connectors: this.options.connectors,
      ...(request.params === undefined ? {} : { params: request.params }),
      maxRounds: this.maxRounds,
      agent: request.agentId ?? chatAgent,
      clock: this.options.clock,
    });
  }

  /**
   * Halonic's tools for a turn: the agent's memory tools come last, when
   * there is an agent and a store. A chat turn gets these only; a run's
   * agent also gets what its file grants ({@link LocalExecutor.runToolsOf}).
   *
   * @param runId - the run the turn is in, which the agent's notes name; absent in a chat
   */
  private halonicToolsOf(agentId: string | undefined, runId?: string): readonly HalonicTool[] {
    const records = this.options.memory;
    if (agentId === undefined || records === undefined) {
      return this.options.halonicTools;
    }
    const memory = new AgentMemory({
      records,
      clock: this.options.clock,
      agentId,
      ...(runId === undefined ? {} : { runId }),
    });
    return [...this.options.halonicTools, ...memoryTools(memory)];
  }

  /**
   * The tools of an agent in a run: Halonic's tools and its memory tools,
   * then the run-log, records and subagent tools its kept file grants. An
   * agent the definitions have no file for gets the first two only.
   */
  private runToolsOf(turn: RunTurn, agentId: string, depth: number): readonly HalonicTool[] {
    const own = this.halonicToolsOf(agentId, turn.run.runId);
    const agent = agentIn(turn.definitions, agentId);
    if (agent === undefined || this.options.runs === undefined) {
      return own;
    }
    const granted = runAgentTools({
      agent,
      hubId: turn.run.hubId,
      runId: turn.run.runId,
      state: turn.state,
      definitions: turn.definitions,
      depth,
      runs: this.options.runs.store,
      ...(this.options.memory === undefined ? {} : { records: this.options.memory }),
      clock: this.options.clock,
      runSubagent: (task) => this.runSubagent(turn, task),
    });
    return [...own, ...granted];
  }

  /**
   * A subagent's own turn on a task, one level deeper, on its own model and
   * with its own tools. Its calls are checked as a run's are, except that
   * one that needs a person's OK is refused ({@link checkSubagentToolCall}).
   *
   * @returns the subagent's answer
   */
  private async runSubagent(turn: RunTurn, task: DelegatedTask): Promise<string> {
    const subagent = agentIn(turn.definitions, task.agent);
    const messages = [{ role: "user" as const, content: task.task }];
    const model = await this.options.resolveModel({
      hubId: turn.run.hubId,
      agentId: task.agent,
      messages,
      tools: [],
    });
    const result = await runModelTurn({
      model,
      secrets: this.options.secrets,
      messages,
      callerTools: [],
      halonicTools: this.runToolsOf(turn, task.agent, task.depth),
      connectors: [],
      maxRounds: subagent?.maxSteps ?? defaultRunMaxRounds,
      agent: task.agent,
      clock: this.options.clock,
      checkCall: checkSubagentToolCall,
    });
    return result.content;
  }

  /**
   * A run's model call: the state's prompt to its agent's model, with
   * Halonic's tools, the agent's memory tools and the tools its file grants
   * ({@link LocalExecutor.runToolsOf}), through the same turn
   * loop a chat turn uses. Every call is checked with `checkToolCall`
   * first ({@link checkRunToolCall}), and the agent's `maxSteps` is the
   * round limit. Connectors stay out until the side-effect boundary
   * (allow sending, idempotency keys, the effect-requested record) is
   * built in HAL-186 step 4c. The agent's own prompt and the turn's run
   * log come later in step 4.
   *
   * A call that needs a person's OK ends the call with `{ type: "approval",
   * tool, args, resume }`, and the run waits. Once they answer, the next
   * call carries `resume` with the answer, and the turn goes on from there.
   *
   * @throws when the run's definitions are gone, as {@link missingDefinitionsError} says
   */
  private async callModel(run: RunState, call: PendingCall): Promise<ModelCallResult> {
    const turn: RunTurn = { run, state: call.state, definitions: await this.keptDefinitions(run) };
    const agent = agentIn(turn.definitions, call.agent);
    const messages = [{ role: "user" as const, content: call.prompt }];
    const model = await this.options.resolveModel({
      hubId: run.hubId,
      agentId: call.agent,
      messages,
      tools: [],
    });
    const outcome = await runAgentTurn({
      model,
      secrets: this.options.secrets,
      messages,
      halonicTools: this.runToolsOf(turn, call.agent, 0),
      connectors: [],
      maxRounds: agent?.maxSteps ?? defaultRunMaxRounds,
      agent: call.agent,
      clock: this.options.clock,
      checkCall: checkRunToolCall,
      ...(call.resume === undefined ? {} : { resumeFrom: call.resume }),
    });
    return outcome.kind === "stopped"
      ? outcome.stop
      : { type: "model", output: outcome.result.content };
  }

  /** The definitions the run started with. */
  private async keptDefinitions(run: RunState): Promise<RunDefinitions> {
    if (this.options.runs === undefined) {
      throw noRuns();
    }
    const definitions = await readDefinitions(this.options.runs.blobs, run.definitionsVersion);
    if (definitions === null) {
      throw new Error(missingDefinitionsError(run.definitionsVersion));
    }
    return definitions;
  }
}

/**
 * The agent's file in a run's definitions, or `undefined` for a run kept
 * before agents joined its definitions.
 */
function agentIn(definitions: RunDefinitions, agentId: string): Agent | undefined {
  const agents = definitions.agents ?? {};
  return Object.hasOwn(agents, agentId) ? agents[agentId] : undefined;
}

function noRuns(): Error {
  return new Error("This local executor runs chat turns only: it was created without `runs`.");
}
