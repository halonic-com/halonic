// Chat turns whose agent runs in a harness program: each message is one
// harness call, in the agent's sandbox, that ends with the agent's answer
// (HAL-189 plan, amendment to 4f). A chat has no run log, so the call's
// events are read only for what the turn reports: the model and its usage.
// Nothing outside a run can wait for a person, so an approval the harness
// asks for is refused, as the built-in chat turn refuses one.

import { addUsage, type RunEventBody, type Usage } from "@halonicjs/events";
import type { Agent } from "@halonicjs/format";
import type {
  ChatTurnRefusal,
  ChatTurnRequest,
  ChatTurnResponse,
  Clock,
  IdGenerator,
  ScheduledTimer,
  Scheduler,
} from "@halonicjs/ports";
import { chatApprovalReason } from "../agent/check-chat-tool-call.ts";
import { isProgramHarness } from "../kernel/agent-call.ts";
import type { ProgramHarness } from "../kernel/decide-types.ts";
import { LiveHarnessCalls } from "../run/live-harness-calls.ts";
import { StartDeadlines } from "../run/start-deadlines.ts";
import { chatPrompt } from "./chat-prompt.ts";
import type { HarnessRunsOptions } from "./harness-host.ts";
import {
  type HarnessApprovals,
  type HarnessCall,
  type HarnessEventLog,
  runHarnessCall,
} from "./run-harness-call.ts";

/** What chat turns in a harness need: the host's harness ports, and the engine's timers and ids. */
export interface ChatHarnessOptions {
  readonly harnesses: HarnessRunsOptions;
  /** Ends a start that takes too long; its timers must reach {@link ChatHarnessTurns.expire}. */
  readonly scheduler: Scheduler;
  /** Gives each turn the id its harness call goes by, as a run's id would. */
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** One chat turn to run in a harness: the request, and the agent's file that names the harness. */
export interface ChatHarnessTurn {
  readonly request: ChatTurnRequest;
  readonly agentId: string;
  /** The agent's file as the workspace has it now. */
  readonly agent: Agent;
  readonly harness: ProgramHarness;
}

/**
 * The chat turn as a harness turn, when its agent's file names a harness
 * program; `undefined` when Halonic's own loop runs it.
 */
export function harnessTurnOf(
  request: ChatTurnRequest,
  agent: Agent | undefined,
): ChatHarnessTurn | undefined {
  const { agentId } = request;
  const harness = agent?.harness;
  if (agentId === undefined || agent === undefined || harness === undefined) return undefined;
  return isProgramHarness(harness) ? { request, agentId, agent, harness } : undefined;
}

/** The `error` a chat turn rejects with when the person stops the chat while the agent works. */
export const chatStoppedMessage = "The chat was stopped while the agent was working.";

/** What the harness is told when it asks for an approval during a chat turn. */
export const chatApprovalComment =
  "Nobody can approve this in a chat, so it was refused. Do the task without it, or say what you needed.";

/**
 * The state name the call's `harness.started` and `sandbox.*` events carry.
 * A chat has no workflow state, and these events never reach a run log.
 */
const chatState = "chat";

/** The chat turns of this engine that run in a harness. */
export class ChatHarnessTurns {
  readonly #options: ChatHarnessOptions;
  readonly #deadlines: StartDeadlines;
  readonly #live = new LiveHarnessCalls();

  constructor(options: ChatHarnessOptions) {
    this.#options = options;
    this.#deadlines = new StartDeadlines(options.scheduler, options.clock);
  }

  /**
   * Runs the turn as one harness call, with the conversation so far in its
   * prompt, and gives back the agent's answer. The caller's tools aren't
   * offered to the harness. When the request's `signal` aborts, the harness
   * run is stopped, its sandbox and bridge are closed, and the turn rejects.
   * It returns, or rejects, only once all three have stopped.
   *
   * @throws an error with {@link chatStoppedMessage} when the request's `signal` aborts
   * @throws what the harness call throws, such as a sandbox that isn't ready or doesn't open in time
   */
  async turn({ request, agentId, agent, harness }: ChatHarnessTurn): Promise<ChatTurnResponse> {
    if (request.signal?.aborted) throw new Error(chatStoppedMessage);
    // A chat has no run, so the harness call goes by an id of the turn's own.
    const turnId = this.#options.ids.next("chat");
    const call: HarnessCall = {
      effect: {
        callId: turnId,
        state: chatState,
        agent: agentId,
        harness,
        prompt: chatPrompt(request.messages),
      },
      runId: turnId,
      hubId: request.hubId,
      agent,
      // Proposal folders are for runs (HAL-3248): a chat turn has none.
      filesFolder: null,
    };
    const report = new ChatTurnReport();
    const refusals: ChatTurnRefusal[] = [];
    const approvals = refusingApprovals(harness, refusals);
    const limits = this.#deadlines.of(turnId, turnId);
    const stopOnAbort = () => {
      void this.#live.stop(turnId, chatStoppedMessage);
    };
    request.signal?.addEventListener("abort", stopOnAbort, { once: true });
    let output: unknown;
    try {
      output = await this.#live.run(turnId, (stop) =>
        runHarnessCall(this.#options.harnesses, call, report, approvals, limits, stop),
      );
    } finally {
      request.signal?.removeEventListener("abort", stopOnAbort);
    }
    const content = answerText(output);
    return {
      model: report.model ?? agent.model ?? harness,
      content,
      toolCalls: [],
      usage: report.usage,
      finishReason: "stop",
      turn: [{ role: "assistant", content }],
      refusals,
    };
  }

  /** A timer is due: ends a start of a chat turn whose time is up. Other timers change nothing. */
  expire(timer: ScheduledTimer): void {
    if (StartDeadlines.owns(timer)) this.#deadlines.expire(timer);
  }

  /**
   * Stops every chat turn's harness call going on, and resolves once each
   * has stopped its harness run, session and bridge. Turns after this are refused.
   */
  close(): Promise<void> {
    return this.#live.stopAll();
  }
}

/**
 * Where a chat turn's harness call writes its events. Nothing is kept but
 * what the turn reports: the model that answered last and the usage of
 * every model call.
 */
class ChatTurnReport implements HarnessEventLog {
  usage: Usage = { inputTokens: 0, outputTokens: 0 };
  model: string | undefined;

  async append(event: RunEventBody): Promise<void> {
    if (event.type === "llm.response") {
      this.usage = addUsage(this.usage, event.usage);
      this.model = event.model;
    }
  }

  async settled(): Promise<void> {}

  whileHeld<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

/** Approvals that refuse each call at once, and note it in `refusals`. */
function refusingApprovals(harness: ProgramHarness, refusals: ChatTurnRefusal[]): HarnessApprovals {
  return {
    ask: async ({ tool }) => {
      refusals.push({ source: harness, name: tool, refused: "call", reason: chatApprovalReason });
      return { approved: false, comment: chatApprovalComment };
    },
  };
}

/** The agent's result as the chat's answer: its text, or other output as JSON. */
function answerText(output: unknown): string {
  if (typeof output === "string") return output;
  if (output === undefined || output === null) return "";
  return JSON.stringify(output, null, 2);
}
