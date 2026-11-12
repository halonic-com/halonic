// The executor that runs the engine in this process: chat turns, and with
// `runs` set, workflow runs through the run kernel.

import type { RunSummary } from "@halonicjs/events";
import type { Agent } from "@halonicjs/format";
import type {
  ChatTurnRequest,
  ChatTurnResponse,
  ConnectorClient,
  RunEventListener,
  RunExecutor,
  RunSubscription,
  ScheduledTimer,
  SendOptions,
  StartRunRequest,
} from "@halonicjs/ports";
import { chatToolCheckOf } from "./agent/check-chat-tool-call.ts";
import { runToolCheckOf } from "./agent/check-run-tool-call.ts";
import { agentParamsOf } from "./agent/model-params.ts";
import { runAgentTurn, runModelTurn } from "./agent/run-model-turn.ts";
import type { TurnLog } from "./agent/turn-log.ts";
import type { HalonicTool } from "./agent/turn-tools.ts";
import { ChatHarnessTurns, harnessTurnOf } from "./harness/chat-harness-turns.ts";
import type { ModelCallResult, RunDefinitions } from "./kernel/decide-types.ts";
import { agentIn, definitionsOf } from "./kernel/kept-definitions.ts";
import type { PendingCall, RunState } from "./kernel/run-state.ts";
import {
  type AgentKnowledge,
  agentKnowledge,
  noKnowledge,
  openSources,
} from "./knowledge/agent-knowledge.ts";
import type { LocalExecutorOptions } from "./local-executor-options.ts";
import { defaultRunMaxRounds, type RunTurn, runLocalSubagent } from "./local-subagent.ts";
import { runTurnMessages } from "./run/agent-system-prompt.ts";
import { callAlongsideOthers } from "./run/alongside-others.ts";
import {
  allowedToolsOf,
  connectorsOf,
  effectBoundary,
  makeRunConnectorCall,
  openRunConnectorsOf,
} from "./run/connector-calls.ts";
import { LocalRuns } from "./run/local-runs.ts";
import { runsOptionsOf } from "./run/local-runs-options.ts";
import { runAgentTools } from "./run/run-agent-tools.ts";
import { RunsConnectors } from "./run/run-connectors.ts";
import { RunStoreTurnLog } from "./run/run-store-turn-log.ts";
import { AgentMemory } from "./tools/agent-memory/agent-memory.ts";
import { memoryTools } from "./tools/agent-memory/memory-tools.ts";
import { knowledgeTools } from "./tools/knowledge/knowledge-tools.ts";
import { LargeResultsTurnLog } from "./tools/large-results.ts";

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
  /** The connectors runs call: their own with `runs.runConnectors`, else `connectors`. */
  private readonly runConnectors: RunsConnectors | undefined;
  private readonly chatHarnesses: ChatHarnessTurns | undefined;

  /**
   * @throws RangeError when `maxRounds` is less than 1 or not a whole number, or a start
   *   limit in `runs.harnesses` isn't a whole number of milliseconds of 1 or more
   */
  constructor(options: LocalExecutorOptions) {
    const maxRounds = options.maxRounds ?? defaultMaxRounds;
    if (!Number.isInteger(maxRounds) || maxRounds < 1) {
      throw new RangeError(`maxRounds must be a whole number of 1 or more, not ${maxRounds}.`);
    }
    const connectors = options.connectors.filter((each) => !options.localOnly || each.local);
    this.options = { ...options, connectors };
    this.maxRounds = maxRounds;
    const runs = runsOptionsOf(options.runs, options.localOnly === true);
    const connectorCalls = runs?.connectorCalls;
    this.runConnectors =
      runs === undefined
        ? undefined
        : new RunsConnectors(
            runs.store,
            runs.runConnectors,
            connectors,
            options.localOnly === true,
          );
    this.runs =
      runs === undefined
        ? undefined
        : new LocalRuns(
            runs,
            options.clock,
            (run, call) => this.callModel(run, call),
            connectorCalls === undefined
              ? undefined
              : (effect, run) =>
                  makeRunConnectorCall(
                    () => this.connectorsOfRun(run),
                    effectBoundary(connectorCalls),
                    effect,
                  ),
            this.runConnectors,
          );
    this.chatHarnesses =
      runs?.harnesses === undefined
        ? undefined
        : new ChatHarnessTurns({
            harnesses: runs.harnesses,
            scheduler: runs.scheduler,
            ids: runs.ids,
            clock: options.clock,
          });
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

  /**
   * Ends the run, and the child run it waits on, with `reason: "cancelled"`,
   * and stops their harness calls. A run that has ended stays as it is.
   *
   * @throws InputRefused when the run doesn't exist
   */
  cancel(runId: string): Promise<RunSummary> {
    return this.runs === undefined ? Promise.reject(noRuns()) : this.runs.cancel(runId);
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
    this.chatHarnesses?.expire(timer);
    await this.runs?.onTimer(timer);
  }

  /**
   * Stops the engine's work in this process. It stops every harness run,
   * then its sandbox session, then its bridge, and resolves once all three
   * have stopped; a session that opens after that is closed as it opens.
   * Harness runs that were going end as `interrupted` when an engine next
   * starts on the same store, and chat turns in a harness reject. Timers
   * delivered after this change nothing. `localEngine`'s `close` calls it
   * before it closes the scheduler.
   */
  async close(): Promise<void> {
    await Promise.all([this.runs?.close(), this.chatHarnesses?.close()]);
  }

  /**
   * Runs one chat turn with the caller's tools, Halonic's tools, the agent's
   * knowledge tools and the connected servers' tools: only those its file
   * lists when the turn names an agent with a file. It keeps no run log,
   * because a chat turn belongs to no run: the models it skipped are in
   * `skipped` instead.
   *
   * A turn whose agent's file names a harness program runs in that harness
   * instead, as one harness call ({@link ChatHarnessTurns.turn}).
   *
   * @throws when no model fits the request
   * @throws {ModelCallError} when no model is left, or with the reason the model gave for any other failure
   * @throws when the agent runs in a harness and the executor has no `runs.harnesses`, or the harness call fails
   */
  async chatTurn(request: ChatTurnRequest): Promise<ChatTurnResponse> {
    const agent = await this.chatAgentFileOf(request);
    const harnessTurn = harnessTurnOf(request, agent);
    if (harnessTurn !== undefined) {
      if (this.chatHarnesses === undefined) {
        throw new Error(
          `Agent "${harnessTurn.agentId}" runs in ${harnessTurn.harness}, and this executor has no harnesses to run it in.`,
        );
      }
      return this.chatHarnesses.turn(harnessTurn);
    }
    const knowledge = await this.chatKnowledgeOf(request);
    const lists = await this.options.chatConnectorToolsOf?.(request);
    const connectors =
      agent === undefined ? this.options.connectors : connectorsOf(this.options.connectors, agent);
    return runModelTurn({
      model: await this.options.resolveModel(request),
      secrets: this.options.secrets,
      messages: request.messages,
      callerTools: request.tools,
      halonicTools: [...this.halonicToolsOf(request.agentId), ...knowledgeTools(knowledge.sources)],
      connectors: lists === undefined ? connectors : allowedToolsOf(connectors, lists),
      ...(lists === undefined ? {} : { checkCall: chatToolCheckOf(lists) }),
      ...agentParamsOf(agent, request.params),
      maxRounds: this.maxRounds,
      agent: request.agentId ?? chatAgent,
      clock: this.options.clock,
      autoKnowledge: knowledge.auto,
      localOnly: this.options.localOnly === true,
    });
  }

  /**
   * The file of the agent a chat turn names, as the workspace has it now;
   * `undefined` when it names none, the agent has no file, or the executor
   * has no `chatAgentOf`.
   */
  private async chatAgentFileOf(request: ChatTurnRequest): Promise<Agent | undefined> {
    if (request.agentId === undefined || this.options.chatAgentOf === undefined) return undefined;
    return this.options.chatAgentOf(request);
  }

  /** The knowledge sources of a chat turn's agent, as the workspace has them now. */
  private async chatKnowledgeOf(request: ChatTurnRequest): Promise<AgentKnowledge> {
    const options = this.options.knowledge;
    if (options === undefined || request.agentId === undefined) {
      return noKnowledge;
    }
    return openSources(request.hubId, await options.chatSourcesOf(request), options);
  }

  /**
   * The knowledge sources of an agent in a run, from the run's kept
   * definitions; none for an agent the definitions have no file for.
   */
  private runKnowledgeOf(turn: RunTurn, agentId: string): AgentKnowledge {
    const options = this.options.knowledge;
    const agent = agentIn(turn.definitions, agentId);
    if (options === undefined || agent === undefined) {
      return noKnowledge;
    }
    return agentKnowledge(
      turn.run.hubId,
      agent.knowledge,
      turn.definitions.knowledge ?? {},
      options,
    );
  }

  /**
   * Halonic's tools for a turn: the agent's memory tools come last, when
   * there is an agent and a store. A chat turn adds the agent's knowledge
   * tools; a run's agent also gets those and what its file grants
   * ({@link LocalExecutor.runToolsOf}).
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
   * The tools of an agent in a run: Halonic's tools, its memory tools and
   * its knowledge tools, then the run-log, records and subagent tools its
   * kept file grants. An agent the definitions have no file for gets the
   * first two only, because its knowledge comes from that file too.
   */
  private runToolsOf(
    turn: RunTurn,
    agentId: string,
    depth: number,
    knowledge: AgentKnowledge,
  ): readonly HalonicTool[] {
    const own = [
      ...this.halonicToolsOf(agentId, turn.run.runId),
      ...knowledgeTools(knowledge.sources),
    ];
    const agent = agentIn(turn.definitions, agentId);
    if (agent === undefined || this.options.runs === undefined) {
      return own;
    }
    const connectorCalls = this.options.runs.connectorCalls;
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
      log: turn.log,
      runSubagent: (task) =>
        runLocalSubagent(
          {
            turn,
            resolveModel: (request) => this.options.resolveModel(request),
            secrets: this.options.secrets,
            clock: this.options.clock,
            connectorsOfRun: () => this.connectorsOfRun(turn.run),
            ...(connectorCalls === undefined ? {} : { effects: effectBoundary(connectorCalls) }),
            localOnly: this.options.localOnly === true,
            knowledgeOf: (id) => this.runKnowledgeOf(turn, id),
            toolsOf: (id, depth, knowledge) => this.runToolsOf(turn, id, depth, knowledge),
          },
          task,
        ),
    });
    return [...own, ...granted];
  }

  /**
   * A run's model call: the state's prompt to its agent's model, with Halonic's tools, the
   * agent's memory and knowledge tools, the tools its file grants ({@link LocalExecutor.runToolsOf})
   * and, with `runs.connectorCalls`, the tools of the connected servers its kept file lists that
   * their kept files allow ({@link openRunConnectorsOf}), through the same turn loop a chat turn uses.
   * Every call is checked with `checkToolCall` first, and a connector call its kept file puts
   * under `approve` asks a person ({@link runToolCheckOf}), and the agent's `maxSteps` is the
   * round limit: a turn that reaches it while the model still calls tools fails the call. The model
   * gets the agent's instructions and skills as a system message ({@link runTurnMessages}). The
   * turn, with its subagents' turns, writes its events to the run's log
   * ({@link LocalExecutor.turnLogOf}), so the run's cost counts its calls.
   *
   * A connector tool its kept file lists under `read`, and not under `approve`, counts as reading:
   * its calls run without a person's OK, and the run log gets a `tool.unasked` before each one. A
   * `parallel` branch's or a `foreach` item's call, and any call in a run a `foreach` item started
   * or below it ({@link callAlongsideOthers}), is offered only those tools ({@link openRunConnectorsOf}):
   * none can make a call that changes things, because a run records one effect at a time, and a
   * call that waits for a person would only end the branch or fail the run.
   *
   * A call that needs a person's OK ends the call with `{ type: "approval",
   * tool, args, resume }`, and the run waits. A connector call that can
   * change things passes the "allow sending" check, then ends the call with
   * `{ type: "effect", connector, tool, args, resume }`: the engine records
   * it before it makes it. Either way, the next call carries `resume` with
   * the answer or the result, and the turn goes on from there.
   *
   * @throws UnreadableDefinitions when the run's definitions are gone or can't be read, with why
   */
  private async callModel(run: RunState, call: PendingCall): Promise<ModelCallResult> {
    const turn: RunTurn = {
      run,
      state: call.state,
      definitions: await this.keptDefinitions(run),
      alongsideOthers: await callAlongsideOthers(this.options.runs?.store, run, call.callId),
      log: this.turnLogOf(run, call),
    };
    const agent = agentIn(turn.definitions, call.agent);
    const messages = runTurnMessages(agent, turn.definitions, call.prompt);
    const model = await this.options.resolveModel({
      hubId: run.hubId,
      agentId: call.agent,
      messages,
      tools: [],
    });
    const connectorCalls = this.options.runs?.connectorCalls;
    const connectorTools = turn.definitions.connectorTools ?? {};
    const connectors =
      connectorCalls === undefined
        ? []
        : await openRunConnectorsOf(
            () => this.connectorsOfRun(run),
            agent,
            connectorTools,
            turn.alongsideOthers,
          );
    // Built on a resumed call too: the model can still search after the OK.
    const knowledge = this.runKnowledgeOf(turn, call.agent);
    const maxRounds = agent?.maxSteps ?? defaultRunMaxRounds;
    const outcome = await runAgentTurn({
      model,
      secrets: this.options.secrets,
      messages,
      halonicTools: this.runToolsOf(turn, call.agent, 0, knowledge),
      connectors,
      connectorTools,
      ...(connectorCalls === undefined ? {} : { effects: effectBoundary(connectorCalls) }),
      ...agentParamsOf(agent),
      maxRounds,
      agent: call.agent,
      clock: this.options.clock,
      checkCall: runToolCheckOf(connectorTools),
      autoKnowledge: knowledge.auto,
      log: turn.log,
      ...(call.resume === undefined ? {} : { resumeFrom: call.resume }),
      localOnly: this.options.localOnly === true,
    });
    if (outcome.kind === "stopped") return outcome.stop;
    // An answer cut off at the limit isn't the agent's answer: the state mustn't go on with it.
    if (outcome.result.atRoundLimit === true) {
      throw new Error(
        `Agent "${call.agent}" used all ${maxRounds} of its steps (maxSteps) and was still calling tools, so it gave no answer.`,
      );
    }
    return { type: "model", output: outcome.result.content };
  }

  /** The connectors a run calls: its top-level run's ({@link RunsConnectors.of}). */
  private async connectorsOfRun(run: RunState): Promise<readonly ConnectorClient[]> {
    if (this.runConnectors === undefined) throw noRuns();
    return await this.runConnectors.of(run);
  }

  /**
   * The log a run's model call writes its turn to: the run's own log
   * ({@link RunStoreTurnLog}), with a tool result over 256 KB in the blob
   * store ({@link LargeResultsTurnLog}).
   *
   * @throws when the executor has no runs, which only a run's call can't be
   */
  private turnLogOf(run: RunState, call: PendingCall): TurnLog {
    if (this.runs === undefined || this.options.runs === undefined) {
      throw new Error(`Run ${run.runId}'s model call has no run store to log to.`);
    }
    // The runs' watched store, so the run's subscribers hear of the turn's events.
    return new LargeResultsTurnLog(
      new RunStoreTurnLog(this.runs.store, run, call, this.options.clock),
      this.options.runs.blobs,
    );
  }

  /** The definitions the run started with. */
  private async keptDefinitions(run: RunState): Promise<RunDefinitions> {
    if (this.options.runs === undefined) throw noRuns();
    return await definitionsOf(this.options.runs.blobs, run.definitionsVersion);
  }
}

function noRuns(): Error {
  return new Error("This local executor runs chat turns only: it was created without `runs`.");
}
