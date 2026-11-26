// A model for scripted Build chat turns: it plays its turns in order and
// keeps the names of the tools each turn offered.

import type { ChatTurnRequest, ChatTurnResponse, ToolCall } from "@halonicjs/ports";

/** A model that plays `turns` in order and keeps the names of the tools each turn offered. */
export class ScriptedModel {
  readonly offered: string[][] = [];
  private readonly turns: ToolCall[][];

  constructor(turns: ToolCall[][]) {
    this.turns = [...turns];
  }

  async chatTurn(request: ChatTurnRequest): Promise<ChatTurnResponse> {
    this.offered.push(request.tools.map((tool) => tool.name));
    const toolCalls = this.turns.shift() ?? [];
    return {
      content: toolCalls.length === 0 ? "Done." : "",
      toolCalls,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: toolCalls.length === 0 ? "stop" : "tool_calls",
      model: "scripted",
    };
  }
}
