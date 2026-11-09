import type { ChatRequest, ChatResponse } from "@halonicjs/ports";

/** What the model answers on one call, as the suite scripts it. The provider adds its own `replay`. */
export type ScriptedAnswer = Omit<ChatResponse, "replay">;

/** A plain text answer, with characters that span more than one UTF-16 unit. */
export const textAnswer: ScriptedAnswer = {
  content: "Hello from Acme: café, 東京 and 👋🏽.\nA second line.",
  toolCalls: [],
  usage: { inputTokens: 12, outputTokens: 9 },
  finishReason: "stop",
};

/** An answer that calls two tools, one with nested arguments. */
export const toolAnswer: ScriptedAnswer = {
  content: "",
  toolCalls: [
    { id: "call_1", name: "search", arguments: { q: "acme", limit: 3 } },
    {
      id: "call_2",
      name: "read_file",
      arguments: { path: "docs/über.md", options: { lines: [1, 20], raw: true, note: null } },
    },
  ],
  usage: { inputTokens: 40, outputTokens: 18 },
  finishReason: "tool_calls",
};

/** An answer cut off at the token limit. */
export const cutOffAnswer: ScriptedAnswer = {
  content: "The list goes on and",
  toolCalls: [],
  usage: { inputTokens: 12, outputTokens: 5 },
  finishReason: "length",
};

/** A text answer with the model's summary of its reasoning. */
export const reasonedAnswer: ScriptedAnswer = {
  ...textAnswer,
  reasoning: "The user greets me, so I greet back in two lines.",
};

/** A fresh request with a system prompt, history and a tool, for the suite and adapter tests. */
export function chatRequest(signal?: AbortSignal): ChatRequest {
  return {
    model: "acme-small",
    messages: [
      { role: "system", content: "You answer briefly." },
      { role: "user", content: "Find the Acme docs." },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_0", name: "search", arguments: { q: "docs" } }],
      },
      { role: "tool", content: '["docs/über.md"]', toolCallId: "call_0", name: "search" },
    ],
    tools: [
      {
        name: "search",
        description: "Searches the workspace.",
        parameters: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
      },
    ],
    params: { temperature: 0, maxTokens: 200 },
    ...(signal === undefined ? {} : { signal }),
  };
}
