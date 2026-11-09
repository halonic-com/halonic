import type { ChatMessage, ChatTurnRequest, ChatTurnResponse, ToolCall } from "@halonicjs/ports";
import type { ChatAnswer, ChatAnswerEnd, ChatAnswerRequest, ChatTool } from "./chat-service.ts";

/** The tool result for a call the model asked for but that didn't run because the person stopped the chat. */
export const notRunAfterStop = "Not run: the person stopped the chat.";

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
      this.request.listener?.onToolCall?.(toolCall);
      this.add(toolResult(toolCall, await this.runTool(toolCall)));
    }
  }

  /** The finished answer. */
  end(end: ChatAnswerEnd): ChatAnswer {
    return { messages: this.added, end };
  }

  private add(message: ChatMessage): void {
    this.added.push(message);
    this.request.listener?.onMessage?.(message);
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
