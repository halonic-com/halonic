import type { ChatMessage, ChatRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MockLlmProvider } from "./mock-provider.ts";

/** A request from one agent, with the given user messages. */
function from(agentId: string, ...userTexts: string[]): ChatRequest {
  const messages: ChatMessage[] = userTexts.map((content) => ({ role: "user", content }));
  return { model: "any", messages, meta: { agentId } };
}

verifies("model-mock.scripted-replies", () => {
  it("answers each agent from its own script in order, others from *", async () => {
    const model = new MockLlmProvider(
      "mock",
      { writer: ["one", "two"], "*": ["any"] },
      () => "fallback",
    );
    const writer = [];
    for (let turn = 0; turn < 3; turn += 1) {
      writer.push((await model.chat(from("writer"))).content);
    }
    expect(writer).toEqual(["one", "two", "fallback"]);
    expect((await model.chat(from("editor"))).content).toBe("any");
  });

  it("uses the * script for a request that names no agent", async () => {
    const model = new MockLlmProvider("mock", { "*": ["any"] });
    expect((await model.chat({ model: "any", messages: [] })).content).toBe("any");
  });

  it("answers plain text with the finish reason stop", async () => {
    const model = new MockLlmProvider("mock", { writer: ["Hello"] });
    const answer = await model.chat(from("writer"));
    expect(answer).toMatchObject({ content: "Hello", toolCalls: [], finishReason: "stop" });
  });
});

verifies("model-mock.tool-call-lines", () => {
  it("turns tool lines into tool calls with counted ids", async () => {
    const reply = 'tool:search {"q":"refund"}\n\ntool:notify urgent';
    const model = new MockLlmProvider("mock", { agent: [reply, "tool:close"] });
    const first = await model.chat(from("agent"));
    expect(first).toMatchObject({ content: "", finishReason: "tool_calls" });
    expect(first.toolCalls).toEqual([
      { id: "mock_call_1", name: "search", arguments: { q: "refund" } },
      { id: "mock_call_2", name: "notify", arguments: { input: "urgent" } },
    ]);
    const second = await model.chat(from("agent"));
    expect(second.toolCalls).toEqual([{ id: "mock_call_3", name: "close", arguments: {} }]);
  });

  it("passes JSON that isn't an object on as input text", async () => {
    const model = new MockLlmProvider("mock", { agent: ["tool:add [1,2]"] });
    const answer = await model.chat(from("agent"));
    expect(answer.toolCalls).toEqual([
      { id: "mock_call_1", name: "add", arguments: { input: "[1,2]" } },
    ]);
  });

  it("keeps a reply as text when one line is not a tool line", async () => {
    const model = new MockLlmProvider("mock", { agent: ["tool:search {}\nThen I answer."] });
    const answer = await model.chat(from("agent"));
    expect(answer).toMatchObject({ content: "tool:search {}\nThen I answer.", toolCalls: [] });
  });
});

verifies("model-mock.fallback-reply", () => {
  it("echoes the last user message when it has no script", async () => {
    const model = new MockLlmProvider();
    const request: ChatRequest = {
      model: "any",
      messages: [
        { role: "user", content: "Hi" },
        { role: "user", content: "Bye" },
        { role: "assistant", content: "Noted" },
      ],
    };
    expect((await model.chat(request)).content).toBe("Bye");
  });

  it("answers empty text when there is no user message", async () => {
    const model = new MockLlmProvider();
    expect((await model.chat({ model: "any", messages: [] })).content).toBe("");
  });

  it("uses the fallback it was given", async () => {
    const model = new MockLlmProvider("mock", {}, (request) => `to ${request.meta?.agentId}`);
    expect((await model.chat(from("writer", "Hi"))).content).toBe("to writer");
  });
});

verifies("model-mock.usage-estimate", () => {
  it("counts about four characters a token, rounded up", async () => {
    const model = new MockLlmProvider("mock", { writer: ["Hello"] });
    const answer = await model.chat(from("writer", "Hi there", "!"));
    expect(answer.usage).toEqual({ inputTokens: 3, outputTokens: 2 });
  });
});

verifies("model-mock.script-left", () => {
  it("reports the replies left and keeps every request", async () => {
    const model = new MockLlmProvider("mock", { writer: ["one", "two"], editor: [] });
    const request = from("writer", "Hi");
    await model.chat(request);
    expect(model.remaining()).toEqual({ writer: 1, editor: 0 });
    expect(model.requests).toEqual([request]);
  });
});
