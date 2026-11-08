import { verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { ChatRequest, ChatResponse, ChatStreamEvent, LlmProvider } from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const response: ChatResponse = {
  content: "Hello",
  toolCalls: [{ id: "call_1", name: "search", arguments: { q: "acme" } }],
  usage: { inputTokens: 3, outputTokens: 2 },
  finishReason: "tool_calls",
};

const request: ChatRequest = { model: "scripted", messages: [{ role: "user", content: "hi" }] };

const chatOnly: LlmProvider = {
  id: "scripted",
  type: "scripted",
  capabilities: { tools: true, jsonOutput: false, vision: false, streaming: false },
  chat: async () => response,
};

const streaming: LlmProvider = {
  ...chatOnly,
  capabilities: { ...chatOnly.capabilities, streaming: true },
  async *stream() {
    yield { type: "text", delta: "Hel" };
    yield { type: "text", delta: "lo" };
    yield { type: "tool-call", index: 0, id: "call_1", name: "search", arguments: '{"q":' };
    yield { type: "tool-call", index: 0, arguments: '"acme"}' };
    yield { type: "done", response };
  },
};

verifies("ports.llm-stream", () => {
  it("keeps stream optional, so a provider with only chat is still a provider", () => {
    expectTypeOf<LlmProvider["stream"]>().toEqualTypeOf<
      ((request: ChatRequest) => AsyncIterable<ChatStreamEvent>) | undefined
    >();
    expect(chatOnly.stream).toBeUndefined();
  });

  it("yields the deltas in order and ends with done and the full response", async () => {
    const events: ChatStreamEvent[] = [];
    for await (const event of streaming.stream?.(request) ?? []) events.push(event);
    expect(events.map((event) => event.type)).toEqual([
      "text",
      "text",
      "tool-call",
      "tool-call",
      "done",
    ]);
    expect(events.at(-1)).toEqual({ type: "done", response });
  });

  it("needs the full response on done", () => {
    // @ts-expect-error: done carries the same response chat() would return
    const bare: ChatStreamEvent = { type: "done" };
    expect(bare).toBeDefined();
  });
});
