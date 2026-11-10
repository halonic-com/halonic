import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ReplyFormatError, readReply, readStopReason, readUsage } from "./reply.ts";

/** A Messages API reply holding `content`, recorded in the shape the API sends. */
function replyWith(content: unknown[], stopReason: string): Record<string, unknown> {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "acme-small",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 12, output_tokens: 9 },
  };
}

/** Thinking blocks as the API writes them; the signatures are made-up test values. */
const thinking = { type: "thinking", thinking: "Look it up.", signature: "test-signature-1" };
const redacted = { type: "redacted_thinking", data: "test-redacted-1" };

verifies("model-anthropic.replies", () => {
  it("reads the text, the usage and the stop reason, with no replay without thinking", () => {
    const body = replyWith(
      [
        { type: "text", text: "Hello " },
        { type: "text", text: "there." },
      ],
      "end_turn",
    );
    expect(readReply(body)).toEqual({
      content: "Hello there.",
      toolCalls: [],
      usage: { inputTokens: 12, outputTokens: 9 },
      finishReason: "stop",
    });
  });

  it("reads thinking as the reasoning, tool calls in order, and keeps the blocks as the replay", () => {
    const blocks = [
      thinking,
      { type: "text", text: "Searching." },
      { type: "tool_use", id: "toolu_1", name: "search", input: { q: "acme" } },
      { type: "tool_use", id: "toolu_2", name: "close", input: null },
    ];
    expect(readReply(replyWith(blocks, "tool_use"))).toEqual({
      content: "Searching.",
      reasoning: "Look it up.",
      toolCalls: [
        { id: "toolu_1", name: "search", arguments: { q: "acme" } },
        { id: "toolu_2", name: "close", arguments: {} },
      ],
      usage: { inputTokens: 12, outputTokens: 9 },
      finishReason: "tool_calls",
      replay: { type: "anthropic", data: blocks },
    });
  });

  it("joins thinking blocks with a blank line, and keeps redacted thinking for the replay", () => {
    const second = { ...thinking, thinking: "Then answer." };
    const blocks = [thinking, redacted, second, { type: "text", text: "Done." }];
    const answer = readReply(replyWith(blocks, "end_turn"));
    expect(answer.reasoning).toBe("Look it up.\n\nThen answer.");
    expect(answer.replay).toEqual({ type: "anthropic", data: blocks });
    expect(readReply(replyWith([redacted], "end_turn")).replay?.data).toEqual([redacted]);
  });

  it("maps the API's stop reasons to ours", () => {
    const reasons = [
      "end_turn",
      "stop_sequence",
      "max_tokens",
      "model_context_window_exceeded",
      "tool_use",
      "pause_turn",
      "refusal",
      null,
    ];
    expect(reasons.map((reason) => readStopReason(reason, false))).toEqual([
      "stop",
      "stop",
      "length",
      "length",
      "tool_calls",
      "other",
      "other",
      "other",
    ]);
    expect(readStopReason("end_turn", true)).toBe("tool_calls");
  });

  it("counts missing usage as zero, skips blocks it can't read, and refuses a reply without content", () => {
    const answer = readReply({
      content: ["stray", { type: "text", text: 5 }, { type: "text", text: "Hi" }],
    });
    expect(answer).toEqual({
      content: "Hi",
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      finishReason: "other",
    });
    expect(
      readReply({ content: [], usage: { input_tokens: -1, output_tokens: "9" } }).usage,
    ).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(() => readReply({ type: "message" })).toThrow(ReplyFormatError);
    expect(() => readReply("Hi")).toThrow(ReplyFormatError);
  });
});

verifies("model-anthropic.reply-cache-usage", () => {
  it("gives cache reads and writes as their own counts, apart from the input", () => {
    const usage = {
      input_tokens: 40,
      output_tokens: 9,
      cache_read_input_tokens: 9_000,
      cache_creation_input_tokens: 1_200,
    };
    expect(readUsage(usage)).toEqual({
      inputTokens: 40,
      outputTokens: 9,
      cacheReadTokens: 9_000,
      cacheWriteTokens: 1_200,
    });
  });

  it("leaves a cache count out when there was none, or when it isn't a count", () => {
    expect(
      readUsage({
        input_tokens: 40,
        output_tokens: 9,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: null,
      }),
    ).toEqual({ inputTokens: 40, outputTokens: 9 });
    expect(readUsage({ input_tokens: 1, output_tokens: 1, cache_read_input_tokens: "5" })).toEqual({
      inputTokens: 1,
      outputTokens: 1,
    });
    expect(
      readUsage({ input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 7 }),
    ).toEqual({
      inputTokens: 1,
      outputTokens: 1,
      cacheWriteTokens: 7,
    });
  });
});
