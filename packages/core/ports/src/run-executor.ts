import type { RunEvent, RunKind, RunSummary, RunTrigger } from "@halonicjs/events";
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
}

/** The model's answer to a {@link ChatTurnRequest}, with the model that gave it. */
export interface ChatTurnResponse extends ChatResponse {
  model: string;
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
   * One model turn outside any run. Served mode forwards it to the host,
   * which has the provider keys, like a run.
   *
   * @throws when the model can't be reached or refuses the call
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
