// The executor that runs the engine in this process: chat turns, and with
// `runs` set, workflow runs through the run kernel.

import type { RunSummary } from "@halonicjs/events";
import type { Agent, Connector } from "@halonicjs/format";
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
import { chatToolCheckOf } from "./agent/check-chat-tool-call.ts";
import { runToolCheckOf } from "./agent/check-run-tool-call.ts";
import type { ResolvedModel } from "./agent/model-chain.ts";
import { agentParamsOf } from "./agent/model-params.ts";
import { runAgentTurn, runModelTurn } from "./agent/run-model-turn.ts";
import type { HalonicTool } from "./agent/turn-tools.ts";
import { ChatHarnessTurns, harnessTurnOf } from "./harness/chat-harness-turns.ts";
import type { ModelCallResult, RunDefinitions } from "./kernel/decide-types.ts";
import { agentIn, definitionsOf } from "./kernel/kept-definitions.ts";
import type { PendingCall, RunState } from "./kernel/run-state.ts";
import {
  type AgentKnowledge,
  type AgentKnowledgeOptions,
  agentKnowledge,
  noKnowledge,
  openSources,
} from "./knowledge/agent-knowledge.ts";
import { defaultRunMaxRounds, type RunTurn, runLocalSubagent } from "./local-subagent.ts";
import { runTurnMessages } from "./run/agent-system-prompt.ts";
import { callAlongsideOthers } from "./run/alongside-others.ts";
import {
  allowedToolsOf,
  connectorsOf,
  effectBoundary,
  makeConnectorCall,
  runConnectorsOf,
} from "./run/connector-calls.ts";
import { LocalRuns } from "./run/local-runs.ts";
import type { LocalRunsOptions } from "./run/local-runs-options.ts";
import { refusalLog } from "./run/refusal-log.ts";
import { runAgentTools } from "./run/run-agent-tools.ts";
import { AgentMemory } from "./tools/agent-memory/agent-memory.ts";
import { memoryTools } from "./tools/agent-memory/memory-tools.ts";
import { knowledgeTools } from "./tools/knowledge/knowledge-tools.ts";

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
  /**
   * Builds agents' knowledge sources. With it, a run's agent and a chat
   * turn's agent get the sources their `knowledge` lists; without it, none.
   */
  readonly knowledge?: AgentKnowledgeOptions;
  /** The connected servers, whose tools are offered last. */
  readonly connectors: readonly ConnectorClient[];
  /** Where a turn checks that a model's key is set, to skip the model before calling it when it isn't. */
  readonly secrets: Secrets;
  readonly clock: Clock;
  /** The most model calls one chat turn makes; 20 when left out. */
  readonly maxRounds?: number;
  /** What runs need. Without it, the executor runs chat turns only and refuses runs. */
  readonly runs?: LocalRunsOptions;
  /**
   * The file of a chat turn's agent as the workspace has it now; `undefined`
   * for an agent that has none. With it, a chat with an agent whose file
   * names a harness program runs in that harness, with `runs.harnesses`;
   * without it, every chat turn runs in Halonic's own loop.
   */
  chatAgentOf?(request: ChatTurnRequest): Promise<Agent | undefined>;
  /**
   * Each connector file's `tools` lists by connector id, as the workspace
   * has them now, for a chat turn. With it, a chat offers each connector
   * only the tools its file's `allow` names, and refuses a call to one its
   * `approve` names, as a run does (HAL-5503); a connector with no lists
   * here isn't offered. Without it, a chat turn offers every tool its
   * connectors list and checks only the risk the servers give.
   */
  chatConnectorToolsOf?(
    request: ChatTurnRequest,
  ): Promise<Readonly<Record<string, Connector["tools"]>>>;
  /**
   * Local-only workspace (`privacy.localOnly`): Halonic's own loop skips models that aren't
   * `local` (a run left with none fails `local-only`) and uses only `local` connectors. Agents
   * in a harness program (`runs.harnesses`) aren't covered yet (HAL-5922).
   */
  readonly localOnly?: boolean;
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
    const connectorCalls = options.runs?.connectorCalls;
    this.runs =
      options.runs === undefined
        ? undefined
        : new LocalRuns(
            options.runs,
            options.clock,
            (run, call) => this.callModel(run, call),
            connectorCalls === undefined
              ? undefined
              : (effect) => makeConnectorCall(connectors, effectBoundary(connectorCalls), effect),
          );
    const runs = options.runs;
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
      runSubagent: (task) =>
        runLocalSubagent(
          {
            turn,
            resolveModel: (request) => this.options.resolveModel(request),
            secrets: this.options.secrets,
            clock: this.options.clock,
            connectors: this.options.connectors,
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
   * their kept files allow ({@link runConnectorsOf}), through the same turn loop a chat turn uses.
   * Every call is checked with `checkToolCall` first, and a connector call its kept file puts
   * under `approve` asks a person ({@link runToolCheckOf}), and the agent's `maxSteps` is the
   * round limit: a turn that reaches it while the model still calls tools fails the call. The model
   * gets the agent's instructions and skills as a system message ({@link runTurnMessages}). The
   * turn's full run log comes in step 4; until then it logs only `tool.refused` ({@link refusalLog}).
   *
   * A `parallel` branch's or a `foreach` item's call, and any call in a run a `foreach` item
   * started or below it ({@link callAlongsideOthers}), is offered only the connector tools whose
   * listing says they read and their kept file doesn't put under `approve` ({@link runConnectorsOf}):
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
    const connectors = runConnectorsOf(
      this.options.connectors,
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
      connectors: connectorCalls === undefined ? [] : connectors,
      ...(connectorCalls === undefined ? {} : { effects: effectBoundary(connectorCalls) }),
      ...agentParamsOf(agent),
      maxRounds,
      agent: call.agent,
      clock: this.options.clock,
      checkCall: runToolCheckOf(connectorTools),
      autoKnowledge: knowledge.auto,
      log: refusalLog(this.runs?.store, run, call, this.options.clock),
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

  /** The definitions the run started with. */
  private async keptDefinitions(run: RunState): Promise<RunDefinitions> {
    if (this.options.runs === undefined) throw noRuns();
    return await definitionsOf(this.options.runs.blobs, run.definitionsVersion);
  }
}

function noRuns(): Error {
  return new Error("This local executor runs chat turns only: it was created without `runs`.");
}
