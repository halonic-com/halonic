import type { ChatTurnRequest, ChatTurnResponse, RunExecutor, ToolCall } from "@halonicjs/ports";

/** A model turn the script plays: an answer, or an error the call rejects with. */
export type ScriptedTurn = ChatTurnResponse | Error;

/**
 * A stub `chatTurn` that plays its turns in order and records each request,
 * for `ChatService` tests. A deliberate fake, as `TestExecutor`: core may
 * not use adapters, not even in tests.
 */
export class ScriptedChat implements Pick<RunExecutor, "chatTurn"> {
  /** Every request, with a copy of its messages as they were at the call. */
  readonly requests: ChatTurnRequest[] = [];
  private readonly turns: ScriptedTurn[];

  constructor(turns: ScriptedTurn[]) {
    this.turns = [...turns];
  }

  async chatTurn(request: ChatTurnRequest): Promise<ChatTurnResponse> {
    this.requests.push({ ...request, messages: [...request.messages] });
    const turn = this.turns.shift();
    if (turn === undefined) {
      throw new Error("the script has no more turns");
    }
    if (turn instanceof Error) {
      throw turn;
    }
    return turn;
  }
}

/** A model turn that answers with text and calls no tool. */
export function textTurn(content: string): ChatTurnResponse {
  return {
    content,
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5 },
    finishReason: "stop",
    model: "acme-small",
  };
}

/** A model turn that calls the given tools. */
export function toolTurn(...toolCalls: ToolCall[]): ChatTurnResponse {
  return { ...textTurn(""), toolCalls, finishReason: "tool_calls" };
}

/** A tool call with arguments. */
export function call(id: string, name: string, args: Record<string, unknown> = {}): ToolCall {
  return { id, name, arguments: args };
}
