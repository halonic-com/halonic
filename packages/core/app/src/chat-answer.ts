import type {
  ChatMessage,
  ChatTurnRequest,
  ChatTurnResponse,
  ChatTurnText,
  ToolCall,
} from "@halonicjs/ports";
import type {
  ChatAnswer,
  ChatAnswerEnd,
  ChatAnswerListener,
  ChatAnswerRequest,
  ChatTool,
} from "./chat-service.ts";

/** The tool result for a call the model asked for but that didn't run because the person stopped the chat. */
export const notRunAfterStop = "Not run: the person stopped the chat.";

/**
 * Thrown inside an answer when one of its listener's methods throws, so the
 * chat service can end the answer as failed with the listener's error,
 * instead of rejecting and losing the messages and `toolsRan`. Internal to
 * `ChatService`.
 */
export class ListenerFailed extends Error {
  /** The error the listener threw. */
  readonly listenerError: Error;

  constructor(listenerError: Error) {
    super(`The chat answer's listener failed: ${listenerError.message}`);
    this.name = "ListenerFailed";
    this.listenerError = listenerError;
  }
}

/**
 * The state of one answer while it is being made: the messages added so far,
 * whether any tool ran, and whether the person stopped it. Internal to
 * `ChatService`.
 */
export class AnswerInProgress {
  /** Whether a tool was called, even one that then failed: it may have changed something. */
  toolsRan = false;
  private readonly request: ChatAnswerRequest;
  /** The tools the current model turn offers, by name: the only ones its calls may run. */
  private offered: Map<string, ChatTool>;
  private readonly added: ChatMessage[] = [];
  /** The first error a listener's method threw, kept in case an executor catches it. */
  private listenerFailure: ListenerFailed | undefined;

  constructor(request: ChatAnswerRequest) {
    this.request = request;
    this.offered = byName(request.tools);
  }

  /** Whether the person stopped the answer. */
  get stopped(): boolean {
    return this.request.signal?.aborted === true;
  }

  /**
   * Starts model turn `turn`: picks the tools it offers, which its calls are then held to, and
   * tells the listener.
   */
  startTurn(turn: number): void {
    this.offered = byName(this.toolsFor(this.messages()));
    this.tell((listener) => listener.onTurn?.(turn));
  }

  /** The request for the turn started last: the conversation so far and the tools it offers. */
  turnRequest(): ChatTurnRequest {
    const request: ChatTurnRequest = {
      ...this.request.settings,
      messages: this.messages(),
      tools: [...this.offered.values()].map((tool) => tool.definition),
    };
    if (this.request.signal !== undefined) {
      request.signal = this.request.signal;
    }
    if (this.request.listener?.onText !== undefined) {
      request.onText = (text) => this.text(text);
    }
    return request;
  }

  /**
   * Ends the answer as failed when a listener's method threw, even one the
   * executor called and caught, such as `onText` inside a model turn.
   *
   * @throws ListenerFailed when a listener's method threw
   */
  throwIfListenerFailed(): void {
    if (this.listenerFailure !== undefined) {
      throw this.listenerFailure;
    }
  }

  /** Adds the assistant message of a model turn. */
  addTurn(response: ChatTurnResponse): void {
    this.add(assistantMessage(response));
    const refusals = response.refusals ?? [];
    if (refusals.length > 0) {
      this.tell((listener) => listener.onRefusals?.(refusals));
    }
    const toolFailures = response.toolFailures ?? [];
    if (toolFailures.length > 0) {
      this.tell((listener) => listener.onToolFailures?.(toolFailures));
    }
    const waiting = response.waiting ?? [];
    this.tell((listener) => listener.onWaiting?.(waiting));
  }

  /**
   * Runs a turn's tool calls in the model's order. Once the person stops the
   * answer, the calls left get {@link notRunAfterStop} as their result, so
   * every tool call in the history still has one.
   */
  async runTools(toolCalls: readonly ToolCall[]): Promise<void> {
    for (const toolCall of toolCalls) {
      if (this.stopped) {
        this.add(toolResult(toolCall, notRunAfterStop));
        continue;
      }
      this.tell((listener) => listener.onToolCall?.(toolCall));
      this.add(toolResult(toolCall, await this.runTool(toolCall)));
    }
  }

  /** The finished answer. */
  end(end: ChatAnswerEnd): ChatAnswer {
    return { messages: this.added, end };
  }

  /** The answer the person stopped, saying whether a tool ran before the stop. */
  endStopped(): ChatAnswer {
    return this.end({ reason: "stopped", toolsRan: this.toolsRan });
  }

  /** The conversation with everything this answer added so far. */
  private messages(): ChatMessage[] {
    return [...this.request.messages, ...this.added];
  }

  /**
   * The tools a turn on `messages` offers: what `offerTools` picks, and only from the request's
   * own `tools`, so it can leave tools out but never add one.
   */
  private toolsFor(messages: readonly ChatMessage[]): readonly ChatTool[] {
    const { tools, offerTools } = this.request;
    if (offerTools === undefined) return tools;
    const picked = offerTools(tools, messages);
    return tools.filter((tool) => picked.includes(tool));
  }

  /** Passes the model's text on as it is written; nothing once the person stopped the answer. */
  private text(text: ChatTurnText): void {
    if (this.stopped) return;
    this.tell((listener) => listener.onText?.(text));
  }

  private add(message: ChatMessage): void {
    this.added.push(message);
    this.tell((listener) => listener.onMessage?.(message));
  }

  /**
   * Calls the listener, if there is one.
   *
   * @throws ListenerFailed when the listener throws
   */
  private tell(call: (listener: ChatAnswerListener) => void): void {
    const listener = this.request.listener;
    if (listener === undefined) {
      return;
    }
    try {
      call(listener);
    } catch (error) {
      this.listenerFailure ??= new ListenerFailed(asError(error));
      throw this.listenerFailure;
    }
  }

  /**
   * Runs one tool call and returns its result text. A failure becomes the
   * result, so the model can react to it and every tool call in the history
   * keeps a result, which providers require. A tool the turn didn't offer isn't run.
   */
  private async runTool(toolCall: ToolCall): Promise<string> {
    const tool = this.offered.get(toolCall.name);
    if (tool === undefined) {
      return `Error: there is no tool named "${toolCall.name}".`;
    }
    this.toolsRan = true;
    try {
      return await tool.call(toolCall, this.request.signal);
    } catch (error) {
      return `Error: ${asError(error).message}`;
    }
  }
}

function byName(tools: readonly ChatTool[]): Map<string, ChatTool> {
  return new Map(tools.map((tool) => [tool.definition.name, tool]));
}

/** The assistant message for a model turn, keeping the provider's `replay` unchanged. */
function assistantMessage(response: ChatTurnResponse): ChatMessage {
  const message: Extract<ChatMessage, { role: "assistant" }> = {
    role: "assistant",
    content: response.content,
  };
  if (response.toolCalls.length > 0) {
    message.toolCalls = response.toolCalls;
  }
  if (response.replay !== undefined) {
    message.replay = response.replay;
  }
  return message;
}

function toolResult(toolCall: ToolCall, content: string): ChatMessage {
  return { role: "tool", content, toolCallId: toolCall.id, name: toolCall.name };
}

/** The error a rejection carries, as an `Error` even when something else was thrown. */
export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
