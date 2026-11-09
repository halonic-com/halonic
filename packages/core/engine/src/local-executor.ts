// The executor that runs the engine in this process. It starts with chat
// turns only; the kernel tasks (HAL-186 steps 3a and 3b) add runs to this
// same class.

import type { RunSummary } from "@halonicjs/events";
import type {
  ChatTurnRequest,
  ChatTurnResponse,
  Clock,
  ConnectorClient,
  LlmProvider,
  RunEventListener,
  RunExecutor,
  RunSubscription,
} from "@halonicjs/ports";
import { runModelTurn } from "./agent/run-model-turn.ts";
import type { HalonicTool } from "./agent/turn-tools.ts";

/** The provider and model a chat turn goes to. */
export interface ResolvedModel {
  readonly provider: LlmProvider;
  /** The model name at that provider. */
  readonly model: string;
}

/** What a {@link LocalExecutor} works with. Everything comes in here: no registry, no adapters. */
export interface LocalExecutorOptions {
  /**
   * Picks the model of a chat turn from its request: `alias`, `agentId` and
   * the unsaved `agent` settings. The workspace package plugs in here once
   * it has model aliases.
   *
   * @throws when no model fits; `chatTurn` then rejects with that error
   */
  resolveModel(request: ChatTurnRequest): Promise<ResolvedModel>;
  /** Halonic's own tools, offered after the caller's. */
  readonly halonicTools: readonly HalonicTool[];
  /** The connected servers, whose tools are offered last. */
  readonly connectors: readonly ConnectorClient[];
  readonly clock: Clock;
  /** The most model calls one chat turn makes; 20 when left out. */
  readonly maxRounds?: number;
}

/** The round limit of a chat turn when the options don't set one. */
export const defaultMaxRounds = 20;

/** The agent name a chat turn's model calls carry when the request names none. */
const chatAgent = "chat";

/**
 * The {@link RunExecutor} that runs the engine in this process. For now it
 * runs chat turns only; `start`, `startAgent`, `send` and `subscribe` refuse
 * until the run kernel is built into it.
 */
export class LocalExecutor implements RunExecutor {
  readonly id = "local";
  private readonly options: LocalExecutorOptions;
  private readonly maxRounds: number;

  /** @throws RangeError when `maxRounds` is less than 1 or not a whole number */
  constructor(options: LocalExecutorOptions) {
    const maxRounds = options.maxRounds ?? defaultMaxRounds;
    if (!Number.isInteger(maxRounds) || maxRounds < 1) {
      throw new RangeError(`maxRounds must be a whole number of 1 or more, not ${maxRounds}.`);
    }
    this.options = options;
    this.maxRounds = maxRounds;
  }

  start(): Promise<RunSummary> {
    return Promise.reject(notBuilt("start"));
  }

  startAgent(): Promise<RunSummary> {
    return Promise.reject(notBuilt("startAgent"));
  }

  send(): Promise<RunSummary> {
    return Promise.reject(notBuilt("send"));
  }

  /** As the port asks, it doesn't throw: the listener's `onClose` gets the error after this returns. */
  subscribe(_runId: string, _afterSeq: number, listener: RunEventListener): RunSubscription {
    let open = true;
    void Promise.resolve().then(() => {
      if (open) {
        listener.onClose(notBuilt("subscribe"));
      }
    });
    return {
      close: () => {
        open = false;
      },
    };
  }

  /**
   * Runs one chat turn with the caller's tools, Halonic's tools and the
   * connected servers' tools. It keeps no run log, because a chat turn
   * belongs to no run.
   *
   * @throws when no model fits the request or the model call fails
   */
  async chatTurn(request: ChatTurnRequest): Promise<ChatTurnResponse> {
    const { provider, model } = await this.options.resolveModel(request);
    const result = await runModelTurn({
      provider,
      model,
      messages: request.messages,
      callerTools: request.tools,
      halonicTools: this.options.halonicTools,
      connectors: this.options.connectors,
      ...(request.params === undefined ? {} : { params: request.params }),
      maxRounds: this.maxRounds,
      agent: request.agentId ?? chatAgent,
      clock: this.options.clock,
    });
    return { ...result, model };
  }
}

function notBuilt(method: string): Error {
  return new Error(`The local executor can't ${method} runs yet; it only runs chat turns for now.`);
}
