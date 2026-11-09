import type { ChatMessage, ChatTurnRequest, ChatTurnResponse, ToolCall } from "@halonicjs/ports";
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
  private readonly tools: Map<string, ChatTool>;
  private readonly added: ChatMessage[] = [];

  constructor(request: ChatAnswerRequest) {
    this.request = request;
    this.tools = new Map(request.tools.map((tool) => [tool.definition.name, tool]));
  }

  /** Whether the person stopped the answer. */
  get stopped(): boolean {
    return this.request.signal?.aborted === true;
  }

  /** Tells the listener that model turn `turn` starts. */
  startTurn(turn: number): void {
    this.tell((listener) => listener.onTurn?.(turn));
  }

  /** The request for the next model turn: the conversation with everything added so far. */
  turnRequest(): ChatTurnRequest {
    return {
      ...this.request.settings,
      messages: [...this.request.messages, ...this.added],
      tools: this.request.tools.map((tool) => tool.definition),
    };
  }

  /** Adds the assistant message of a model turn. */
  addTurn(response: ChatTurnResponse): void {
    this.add(assistantMessage(response));
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
      throw new ListenerFailed(asError(error));
    }
  }

  /**
   * Runs one tool call and returns its result text. A failure becomes the
   * result, so the model can react to it and every tool call in the history
   * keeps a result, which providers require.
   */
  private async runTool(toolCall: ToolCall): Promise<string> {
    const tool = this.tools.get(toolCall.name);
    if (tool === undefined) {
      return `Error: there is no tool named "${toolCall.name}".`;
    }
    this.toolsRan = true;
    try {
      return await tool.call(toolCall);
    } catch (error) {
      return `Error: ${asError(error).message}`;
    }
  }
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
