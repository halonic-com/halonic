import type {
  CantTryStep,
  ModelSkipReason,
  RunEvent,
  RunKind,
  RunSummary,
  RunTrigger,
  RunVersion,
} from "@halonicjs/events";
import type { ChatMessage, ChatParams, ChatResponse, ToolDefinition } from "./chat.ts";

/** Version of the {@link RunExecutor} port. A breaking change bumps it and comes with an ADR. */
export const runExecutorVersion = 1;

/**
 * Start a workflow run. Subflows are not started through this port: the
 * engine starts them inside the executor, which also tells the parent when a
 * child finishes.
 */
export interface StartRunRequest {
  hubId: string;
  workflowId: string;
  input: Record<string, unknown>;
  kind?: RunKind;
  trigger?: RunTrigger;
  /**
   * The harness every task agent of the run runs in, whatever its file
   * names, such as `codex`; `halonic` runs them all in Halonic's own loop.
   * Its child runs use it too. Each agent's own harness when absent. An id
   * that isn't a harness is refused before anything is recorded. Whether
   * the harness is installed is the caller's check (`detect()`).
   */
  harness?: string;
  /**
   * The steps of a Try it or Test run that can't be tried, as found when the
   * caller loaded the run's item: each `step` names a state of the run's
   * workflow, or is `null` when the whole item can't be tried. They go on
   * `run.started`, and the run never runs them. None when absent.
   */
  cantTry?: readonly CantTryStep[];
  /**
   * Which version of the workspace the run reads, as the caller loaded it:
   * the live version, with its commit and date, or the saved files. It goes
   * on `run.started`, and the run's child runs record it too. Not recorded
   * when absent. The local executor passes it to `definitionsOf`, so the
   * host gives the run that version's files; it doesn't check them against it.
   */
  version?: RunVersion;
  /**
   * The id the run gets, for a start that may be repeated: a routine fire, a
   * mail or a signal. When a run with this id already exists, `start` returns
   * its summary and starts nothing, whatever the rest of the request says.
   * A new id from the executor's `IdGenerator` when absent. At most 256
   * UTF-8 bytes, because it becomes a `Scheduler` key; a longer one
   * is refused with a `RangeError` before anything is recorded.
   */
  runId?: string;
}

/** Start a run of a single agent with a prompt. */
export interface StartAgentRequest {
  hubId: string;
  agentId: string;
  prompt: string;
  /**
   * What started the run, as for a workflow run. A routine that runs one
   * agent sets it, so the routine can find its own runs again (last run,
   * overlap). The old local engine accepted it too.
   */
  trigger?: RunTrigger;
  /**
   * As {@link StartRunRequest.runId}: repeating a start with the same id
   * starts nothing, and an id over 256 UTF-8 bytes is a `RangeError`.
   */
  runId?: string;
}

/** Options for {@link RunExecutor.send}. */
export interface SendOptions {
  /**
   * The tool call the event is meant for, such as the one a person approves,
   * as the run's summary names it. When it is given and the run doesn't wait
   * on that call, `send` is refused before anything is recorded: a person
   * who answered an approval that has since moved on must not approve the
   * next one by accident. Absent: no check.
   */
  readonly callId?: string;
}

/** An agent's model settings for a chat turn that aren't saved in a file yet. */
export interface ChatAgentSettings {
  /** The provider adapter type, such as "openai". */
  type: string;
  /** The model name at that provider. */
  model: string;
  /** The provider's address, when it isn't the adapter's default. */
  baseUrl?: string;
  /**
   * The **name** of the secret that holds the API key, never the key itself.
   * This travels over the wire to a remote host, which looks the name up.
   */
  secret?: string;
  /** Whether the model runs on this machine (such as Ollama), so it has no price. */
  local: boolean;
}

/** One model turn for a chat outside any run (agent chat, the Build assistant, inbox conversations). */
export interface ChatTurnRequest {
  hubId: string;
  /** The model alias to use; the workspace default when absent. */
  alias?: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  /** The agent whose settings and prompt apply, if any. */
  agentId?: string;
  params?: ChatParams;
  /** Unsaved model settings from the agent editor; they win over the saved ones. */
  agent?: ChatAgentSettings;
  /**
   * Aborted when the person stops the chat. An executor that honors it stops
   * the model call and rejects; a remote one also stops waiting for the host.
   * It is never sent over the wire. Optional, so an executor that ignores it
   * still satisfies the port: the caller then drops an answer that comes
   * after the abort.
   */
  signal?: AbortSignal;
}

/**
 * Something a chat turn refused, as data a status view can read. It mirrors
 * `ToolRefusal` from `core/app`, which this package can't import, and adds
 * `call`. `listing`, `tool` and `keyword` are refusals of what a source
 * listed; they never go to the model. `call` is a tool call that didn't run:
 * the check refused it, it named a tool nobody offered, or the turn hit its
 * round limit first.
 */
export interface ChatTurnRefusal {
  /** The id of the tool's source: a connector or integration, or "halonic" for Halonic's own tools. */
  source: string;
  /** The tool's name; left out when a whole listing is refused. */
  name?: string;
  refused: "listing" | "tool" | "keyword" | "call";
  /** Why, as plain text. Text a server wrote is cut and escaped before it gets here. */
  reason: string;
}

/**
 * A model alias a chat turn skipped before calling it. It is what an
 * `llm.skipped` run log event says, for a turn that has no run log.
 */
export interface ChatTurnSkip {
  /** The skipped alias, such as "smart". */
  alias: string;
  provider: string;
  model: string;
  reason: ModelSkipReason;
  /** The alias tried instead; absent when none was left. */
  next?: string;
}

/**
 * The model's answer to a {@link ChatTurnRequest}, with the model that gave it.
 * `content`, `toolCalls` and `finishReason` are those of the turn's last
 * answer; `usage` adds up every model call in the turn.
 */
export interface ChatTurnResponse extends ChatResponse {
  model: string;
  /**
   * Every assistant and tool message the turn added, in order, so the
   * caller can keep the conversation by appending them. It ends with the
   * last answer, or, when the turn ends on the caller's tool calls, with the
   * results of the calls the executor ran from that answer; the caller then
   * adds one tool message for each call in `toolCalls`. Absent
   * from an executor that doesn't report it; the caller then appends the
   * answer itself.
   */
  turn?: ChatMessage[];
  /** What the turn refused, in the order it happened. Absent or empty when it refused nothing. */
  refusals?: ChatTurnRefusal[];
  /** The model aliases skipped before any call, in order. Absent or empty when none was. */
  skipped?: ChatTurnSkip[];
}

/** Receives a run's events from {@link RunExecutor.subscribe}. */
export interface RunEventListener {
  /** One durable event, in order and without gaps. */
  onEvent(event: RunEvent): void;
  /**
   * The stream ended, once and for good. Without an error: the run ended and
   * every event was delivered. With an error: the stream broke (such as a
   * dropped connection), and the caller subscribes again after the last
   * `seq` it saw. Not called when the caller closes the subscription.
   */
  onClose(error?: Error): void;
}

/** An open subscription. Closing it twice is not an error. */
export interface RunSubscription {
  close(): void;
}

/** Whether the engine behind a {@link RunExecutor} can be reached. */
export type EngineConnectionState = "connected" | "lost";

/**
 * The engine connection of an executor that can lose it, such as the remote
 * one in served mode or on a phone connected to a host. A broken run stream
 * only tells its own subscriber; this tells everyone that the engine as a
 * whole is gone, and when it is back.
 */
export interface EngineConnection {
  /** The state now. */
  readonly state: EngineConnectionState;
  /**
   * Calls `listener` on each change of state: never twice in a row with the
   * same state, and never before `onChange` returns. Returns a function that
   * stops it; calling that twice is not an error.
   *
   * A listener may throw, as the shell re-throws its features' errors. The
   * executor catches that inside its own loop, reports it and carries on,
   * so one faulty feature can't break its reconnect handling.
   */
  onChange(listener: (state: EngineConnectionState) => void): () => void;
}

/**
 * Where runs execute. Replaces the old `Runtime` and `RunHost` ports: the
 * local implementation runs the engine in this process, the remote
 * one forwards to a host such as `halonic serve` or a Worker. It is chosen
 * once at start-up, so no caller asks "local or remote?".
 *
 * A run advances one step per call, from timers, so
 * `start` and `send` return once the input is recorded. The summary they
 * return may still be "running"; follow progress with `subscribe`.
 */
export interface RunExecutor {
  /** Identifies the implementation, such as "local" or "remote". */
  readonly id: string;
  /**
   * Starts a workflow run, or returns the existing one for a repeated `runId`.
   *
   * @throws when the hub or workflow doesn't exist or the input is refused
   */
  start(request: StartRunRequest): Promise<RunSummary>;
  /**
   * Starts a run of one agent; its workflow id is "agent:<agentId>". A
   * repeated `runId` returns the existing run.
   *
   * @throws when the hub or agent doesn't exist
   */
  startAgent(request: StartAgentRequest): Promise<RunSummary>;
  /**
   * Delivers an event to a waiting run, such as "approve".
   *
   * @throws when the run doesn't exist, doesn't accept the event now, or
   *   doesn't wait on the call that `options.callId` names
   */
  send(runId: string, event: string, payload?: unknown, options?: SendOptions): Promise<RunSummary>;
  /**
   * Streams a run's durable events: first the stored ones after `afterSeq`,
   * then new ones as they are appended, until the run ends or the stream
   * breaks (see {@link RunEventListener.onClose}). A client that reconnects
   * passes the last sequence number it saw.
   *
   * It returns at once and never throws for the run itself, because a
   * remote executor only learns later whether the run exists: an unknown
   * run gets `onClose(error)`. The listener is never called before
   * `subscribe` returns, so the caller always holds the handle it may
   * need to `close()`.
   */
  subscribe(runId: string, afterSeq: number, listener: RunEventListener): RunSubscription;
  /**
   * Cancels a run that hasn't ended, as Ctrl C or a Stop button asks: it
   * ends with `run.failed` and `reason: "cancelled"`, and so does the child
   * run it waits on. A run that waits ends too. What the run was doing
   * stops where the executor can stop it; anything it still finishes is
   * recorded nowhere. A run that has already ended is left as it is, so a
   * cancel that comes just after the end is not an error.
   *
   * A remote executor forwards it to the host. Optional, so the port keeps
   * version 1, as for `connection`: a caller without it can only stop
   * following the run.
   *
   * @returns the run's summary after the cancel
   * @throws when the run doesn't exist
   */
  cancel?(runId: string): Promise<RunSummary>;
  /**
   * One chat turn outside any run. Served mode forwards it to the host,
   * which has the provider keys, like a run. `request.signal` may cancel it.
   *
   * A turn may take several model calls. The executor offers the model the
   * caller's `request.tools`, Halonic's own tools and the tools the
   * connected servers list, in that order; when two have the same name, the
   * first is kept and the later one refused. It runs the calls to Halonic's
   * and the servers' tools itself and asks the model again, until the model
   * answers without such calls or the round limit is hit. The messages
   * this adds come back in `turn`.
   *
   * The caller's tools run on the caller's side: when the model calls one,
   * the turn ends with `finishReason: "tool_calls"` and only those calls in
   * `toolCalls`. Calls to the executor's tools in the same answer have
   * already run, and their results are in `turn`. At the round limit the
   * turn ends with `finishReason: "length"` and no calls; the calls the
   * model still asked for are dropped and refused. Anything refused along
   * the way (a listing, a tool, a call) is in `refusals`; a refused call
   * also goes back to the model as that call's result. A tool that throws
   * gives the model an error result, not the caller an error. Nothing
   * outside a run can wait for a person, so a call that needs approval is
   * refused here. A model alias skipped before any call, such as one whose
   * provider has no key, is in `skipped`.
   *
   * @throws when the model can't be reached or refuses the call, or when
   *   `request.signal` is aborted and the executor honors it
   */
  chatTurn(request: ChatTurnRequest): Promise<ChatTurnResponse>;
  /**
   * The connection to the engine, for an executor that can lose it. The
   * remote executor sets it from its streams and retries. Absent means
   * always connected: the local executor's engine runs in this process.
   * Optional, so callers check for it and the port keeps version 1.
   */
  readonly connection?: EngineConnection;
}
