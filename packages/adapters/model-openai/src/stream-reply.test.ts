import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { StreamedReply } from "./stream-reply.ts";

/** The full answer after `chunks` are streamed in order. */
function answerAfter(chunks: unknown[]) {
  const reply = new StreamedReply();
  for (const chunk of chunks) reply.add(chunk);
  return reply.response();
}

/** A chunk with one choice whose delta holds `toolCalls`. */
function toolCallChunk(toolCalls: unknown[], finishReason?: string): unknown {
  return {
    choices: [{ index: 0, delta: { tool_calls: toolCalls }, finish_reason: finishReason ?? null }],
  };
}

verifies("model-openai.replies", () => {
  it("builds a streamed tool call up from its pieces and finishes Ollama's stop with tool_calls", () => {
    const answer = answerAfter([
      toolCallChunk([{ index: 0, id: "call_1", function: { name: "search", arguments: '{"q":' } }]),
      toolCallChunk([{ index: 0, function: { arguments: '"acme"}' } }], "stop"),
    ]);
    expect(answer.toolCalls).toEqual([{ id: "call_1", name: "search", arguments: { q: "acme" } }]);
    expect(answer.finishReason).toBe("tool_calls");
  });

  it("gives streamed calls without an id call_<index>", () => {
    const answer = answerAfter([
      toolCallChunk([
        { index: 0, function: { name: "search", arguments: "{}" } },
        { index: 1, function: { name: "close", arguments: "{}" } },
      ]),
    ]);
    expect(answer.toolCalls.map((call) => call.id)).toEqual(["call_0", "call_1"]);
  });

  it("numbers streamed calls from 0 when the server's numbering starts later", () => {
    const reply = new StreamedReply();
    const events = reply.add(
      toolCallChunk([{ index: 2, id: "c", function: { name: "search", arguments: "{}" } }]),
    );
    expect(events).toEqual([
      { type: "tool-call", index: 0, id: "c", name: "search", arguments: "{}" },
    ]);
    expect(reply.response().toolCalls).toEqual([{ id: "c", name: "search", arguments: {} }]);
  });

  it("takes streamed arguments sent as an object as they are", () => {
    const reply = new StreamedReply();
    const events = reply.add(
      toolCallChunk([
        { index: 0, id: "c", function: { name: "search", arguments: { q: "acme" } } },
      ]),
    );
    expect(events).toEqual([
      { type: "tool-call", index: 0, id: "c", name: "search", arguments: '{"q":"acme"}' },
    ]);
    expect(reply.response().toolCalls[0]?.arguments).toEqual({ q: "acme" });
  });

  it("keeps length when a streamed answer with tool calls was cut off", () => {
    const answer = answerAfter([
      toolCallChunk(
        [{ index: 0, id: "c", function: { name: "search", arguments: '{"q":' } }],
        "length",
      ),
    ]);
    expect(answer.finishReason).toBe("length");
    expect(answer.toolCalls[0]?.arguments).toEqual({ input: '{"q":' });
  });
});
