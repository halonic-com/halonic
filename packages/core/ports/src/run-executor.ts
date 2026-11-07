import type { RunEvent, RunKind, RunParent, RunSummary, RunTrigger } from "@halonicjs/events";
import type { ChatMessage, ChatParams, ChatResponse, ToolDefinition } from "./chat.ts";

/** Version of the {@link RunExecutor} port. A breaking change bumps it and comes with an ADR. */
export const runExecutorVersion = 1;

/** Start a workflow run. */
export interface StartRunRequest {
  hubId: string;
  workflowId: string;
  input: Record<string, unknown>;
  kind?: RunKind;
  trigger?: RunTrigger;
  /** Set by the engine when a workflow state starts this run (a subflow). */
  parent?: RunParent;
}

/** Start a run of a single agent with a prompt. */
export interface StartAgentRequest {
  hubId: string;
  agentId: string;
  prompt: string;
}

/** An agent's model settings for a chat turn that aren't saved in a file yet. */
export interface ChatAgentSettings {
  type: string;
  model: string;
  baseUrl?: string;
  secret?: string;
  local: boolean;
}

/** One model turn for a chat outside any run (agent chat, the Build assistant, inbox conversations). */
export interface ChatTurnRequest {
  hubId: string;
  /** The model alias to use; the workspace default when absent. */
  alias?: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  agentId?: string;
  params?: ChatParams;
  agent?: ChatAgentSettings;
}

/** The model's answer to a {@link ChatTurnRequest}, with the model that gave it. */
export interface ChatTurnResponse extends ChatResponse {
  model: string;
}

/** Receives a run's events, in order and without gaps. */
export type RunEventListener = (event: RunEvent) => void;

/** An open subscription. Closing it twice is not an error. */
export interface RunSubscription {
  close(): void;
}

/**
 * Where runs execute. Replaces the old `Runtime` and `RunHost` ports (plan
 * 4.2): the local implementation runs the engine in this process, the remote
 * one forwards to a host such as `halonic serve` or a Worker. It is chosen
 * once at start-up, so no caller asks "local or remote?".
 *
 * A run advances one step per call, from timers (multi-cloud ADR 5.4), so
 * `start` and `send` return once the input is recorded. The summary they
 * return may still be "running"; follow progress with `subscribe`.
 */
export interface RunExecutor {
  /** Identifies the implementation, such as "local" or "remote". */
  readonly id: string;
  /**
   * Starts a workflow run.
   *
   * @throws when the hub or workflow doesn't exist or the input is refused
   */
  start(request: StartRunRequest): Promise<RunSummary>;
  /**
   * Starts a run of one agent; its workflow id is "agent:<agentId>".
   *
   * @throws when the hub or agent doesn't exist
   */
  startAgent(request: StartAgentRequest): Promise<RunSummary>;
  /**
   * Delivers an event to a waiting run, such as "approve".
   *
   * @throws when the run doesn't exist or doesn't accept the event now
   */
  send(runId: string, event: string, payload?: unknown): Promise<RunSummary>;
  /**
   * Streams a run's durable events: first the stored ones after `afterSeq`,
   * then new ones as they are appended. A client that reconnects passes the
   * last sequence number it saw (multi-cloud ADR 5.2).
   */
  subscribe(runId: string, afterSeq: number, listener: RunEventListener): RunSubscription;
  /**
   * One model turn outside any run. Served mode forwards it to the host,
   * which has the provider keys, like a run (plan 4.2).
   *
   * @throws when the model can't be reached or refuses the call
   */
  chatTurn(request: ChatTurnRequest): Promise<ChatTurnResponse>;
}
