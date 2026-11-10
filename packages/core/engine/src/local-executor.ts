// The executor that runs the engine in this process: chat turns, and with
// `runs` set, workflow runs through the run kernel.

import type { RunSummary } from "@halonicjs/events";
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
import type { ResolvedModel } from "./agent/model-chain.ts";
import { runModelTurn } from "./agent/run-model-turn.ts";
import type { HalonicTool } from "./agent/turn-tools.ts";
import type { PendingCall, RunState } from "./kernel/run-state.ts";
import { LocalRuns, type LocalRunsOptions } from "./run/local-runs.ts";
import { AgentMemory } from "./tools/agent-memory/agent-memory.ts";
import { memoryTools } from "./tools/agent-memory/memory-tools.ts";

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
   * Where agents keep their notes. With it, a chat turn that names an agent
   * also offers that agent's memory tools, after the other Halonic tools.
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

/** The agent name a chat turn's model calls carry when the request names none. */
const chatAgent = "chat";

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

  /** @throws RangeError when `maxRounds` is less than 1 or not a whole number */
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
      halonicTools: this.chatTools(request.agentId),
      connectors: this.options.connectors,
      ...(request.params === undefined ? {} : { params: request.params }),
      maxRounds: this.maxRounds,
      agent: request.agentId ?? chatAgent,
      clock: this.options.clock,
    });
  }

  /** Halonic's tools for a chat turn: the agent's memory tools come last, when there is an agent and a store. */
  private chatTools(agentId: string | undefined): readonly HalonicTool[] {
    const records = this.options.memory;
    if (agentId === undefined || records === undefined) {
      return this.options.halonicTools;
    }
    const memory = new AgentMemory({ records, clock: this.options.clock, agentId });
    return [...this.options.halonicTools, ...memoryTools(memory)];
  }

  /**
   * A run's model call: the state's prompt to its agent's model, without
   * tools. Tools (the agent's memory tools among them), the agent's own
   * prompt and the turn's run log come with the agent loop (step 4).
   */
  private async callModel(run: RunState, call: PendingCall): Promise<unknown> {
    const messages = [{ role: "user" as const, content: call.prompt }];
    const model = await this.options.resolveModel({
      hubId: run.hubId,
      agentId: call.agent,
      messages,
      tools: [],
    });
    const turn = await runModelTurn({
      model,
      secrets: this.options.secrets,
      messages,
      callerTools: [],
      halonicTools: [],
      connectors: [],
      maxRounds: 1,
      agent: call.agent,
      clock: this.options.clock,
    });
    return turn.content;
  }
}

function noRuns(): Error {
  return new Error("This local executor runs chat turns only: it was created without `runs`.");
}
