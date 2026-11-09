import type {
  ChatMessage,
  ChatTurnRequest,
  ChatTurnResponse,
  RunExecutor,
  ToolCall,
  ToolDefinition,
} from "@halonicjs/ports";
import { AnswerInProgress, asError, ListenerFailed } from "./chat-answer.ts";

/** The turn limit of a chat when nothing sets one. */
export const defaultTurnLimit = 16;
/** The lowest turn limit a chat may have. */
export const minTurnLimit = 1;
/** The highest turn limit a chat may have. */
export const maxTurnLimit = 64;

/**
 * A tool a chat offers the model, with the code that runs it. The caller
 * builds the list: the Assistant's authoring tools, an agent's tools, and
 * later the connector tools that pass the outside-a-run gate.
 */
export interface ChatTool {
  definition: ToolDefinition;
  /**
   * Runs one call and returns the text the model reads as the result. A
   * refusal is a result too. Throwing gives the model "Error: <message>".
   *
   * `signal` is aborted when the person stops the chat, so a long tool can
   * stop early. A tool that ignores it runs to the end, and its result is kept.
   */
  call(toolCall: ToolCall, signal?: AbortSignal): Promise<string>;
}

/**
 * The model settings of one answer: everything of a `ChatTurnRequest` but the
 * messages, the tools and the signal, which the answer sets itself.
 */
export type ChatSettings = Omit<ChatTurnRequest, "messages" | "tools" | "signal">;

/** One answer to the person's latest message. */
export interface ChatAnswerRequest {
  settings: ChatSettings;
  /** The conversation so far, with the person's new message last. It is not changed. */
  messages: readonly ChatMessage[];
  tools: readonly ChatTool[];
  /** The most model turns this answer makes, from 1 to 64; {@link defaultTurnLimit} when absent. */
  turnLimit?: number;
  /** Aborted when the person clicks Stop. It is passed on to each model turn and tool call. */
  signal?: AbortSignal;
  /** Told how the answer goes, for the chat's status line and transcript. */
  listener?: ChatAnswerListener;
}

/**
 * Hears how an answer goes, such as "thinking…" or "using read_file…". Each
 * method is called inside the answer, so one that throws ends the answer as
 * failed with that error.
 */
export interface ChatAnswerListener {
  /** A model turn starts; the first turn is 1. */
  onTurn?(turn: number): void;
  /** A tool call starts. */
  onToolCall?(toolCall: ToolCall): void;
  /** A message was added to the answer. */
  onMessage?(message: ChatMessage): void;
}

/**
 * How an answer ended:
 * - `answered`: the model answered without calling a tool
 * - `turn-limit`: the model still called tools after `turns` model turns
 * - `stopped`: the person stopped it
 * - `failed`: a model turn or the listener failed. `toolsRan` says whether a tool already
 *   ran in this answer, so it may have changed something and sending the
 *   message again isn't safe.
 */
export type ChatAnswerEnd =
  | { reason: "answered" }
  | { reason: "turn-limit"; turns: number }
  | { reason: "stopped" }
  | { reason: "failed"; error: Error; toolsRan: boolean };

/** The result of {@link ChatService.answer}. */
export interface ChatAnswer {
  /** The messages the answer added, in order: assistant turns and tool results. */
  messages: ChatMessage[];
  end: ChatAnswerEnd;
}

/**
 * Chat outside any run: the agent chat, the Build assistant and inbox
 * conversations. It runs the turn loop on the `RunExecutor.chatTurn` port,
 * so in served mode each model turn goes to the host, which has the provider
 * keys, while the tools still run here. It keeps no conversations: the
 * caller stores them.
 */
export class ChatService {
  private readonly executor: Pick<RunExecutor, "chatTurn">;

  constructor(executor: Pick<RunExecutor, "chatTurn">) {
    this.executor = executor;
  }

  /**
   * Answers the person's latest message: asks the model, runs the tools it
   * calls, gives it their results and asks again, until it answers without
   * a tool call, reaches the turn limit, is stopped or fails.
   *
   * A failed model turn or listener ends the answer instead of throwing, so
   * the caller keeps the messages added before it, such as the results of
   * tools that already ran.
   *
   * @throws RangeError when the turn limit isn't a whole number from 1 to 64
   */
  async answer(request: ChatAnswerRequest): Promise<ChatAnswer> {
    const turnLimit = checkedTurnLimit(request.turnLimit);
    const answer = new AnswerInProgress(request);
    try {
      return await this.runTurns(answer, turnLimit);
    } catch (error) {
      if (error instanceof ListenerFailed) {
        return answer.end({
          reason: "failed",
          error: error.listenerError,
          toolsRan: answer.toolsRan,
        });
      }
      throw error;
    }
  }

  /**
   * The turn loop of {@link answer}.
   *
   * @throws ListenerFailed when the listener throws
   */
  private async runTurns(answer: AnswerInProgress, turnLimit: number): Promise<ChatAnswer> {
    for (let turn = 1; turn <= turnLimit; turn += 1) {
      if (answer.stopped) {
        return answer.end({ reason: "stopped" });
      }
      answer.startTurn(turn);
      const response = await this.askModel(answer);
      // An executor may ignore the signal and answer after Stop anyway, so that answer is dropped.
      if (answer.stopped) {
        return answer.end({ reason: "stopped" });
      }
      if (response instanceof Error) {
        return answer.end({ reason: "failed", error: response, toolsRan: answer.toolsRan });
      }
      answer.addTurn(response);
      if (response.toolCalls.length === 0) {
        return answer.end({ reason: "answered" });
      }
      await answer.runTools(response.toolCalls);
    }
    // Stop during the last turn's tools is still a stop, not the turn limit.
    if (answer.stopped) {
      return answer.end({ reason: "stopped" });
    }
    return answer.end({ reason: "turn-limit", turns: turnLimit });
  }

  /** One model turn, or the error it failed with. */
  private async askModel(answer: AnswerInProgress): Promise<ChatTurnResponse | Error> {
    try {
      return await this.executor.chatTurn(answer.turnRequest());
    } catch (error) {
      return asError(error);
    }
  }
}

function checkedTurnLimit(turnLimit: number = defaultTurnLimit): number {
  if (!Number.isInteger(turnLimit) || turnLimit < minTurnLimit || turnLimit > maxTurnLimit) {
    throw new RangeError(
      `The turn limit must be a whole number from ${minTurnLimit} to ${maxTurnLimit}, not ${turnLimit}.`,
    );
  }
  return turnLimit;
}
