import type { ChatStreamEvent } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ReplyFormatError, readReply } from "./reply.ts";
import { MessageStreamReader, StreamedVendorError } from "./stream-reply.ts";

type Data = Record<string, unknown>;

/** Reads `events`, each as the data of one server-sent event, and gives the pieces. */
function readAll(reader: MessageStreamReader, events: Data[]): ChatStreamEvent[] {
  return events.flatMap((data) => reader.read(JSON.stringify(data)));
}

const start = (index: number, block: Data): Data => ({
  type: "content_block_start",
  index,
  content_block: block,
});
const delta = (index: number, value: Data): Data => ({
  type: "content_block_delta",
  index,
  delta: value,
});
const stop = (index: number): Data => ({ type: "content_block_stop", index });
const text = (index: number, value: string) => delta(index, { type: "text_delta", text: value });
const json = (index: number, value: string) =>
  delta(index, { type: "input_json_delta", partial_json: value });

const messageStart: Data = {
  type: "message_start",
  message: {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "acme-small",
    content: [],
    stop_reason: null,
    usage: { input_tokens: 25, output_tokens: 1 },
  },
};
const messageEnd: Data[] = [
  { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 15 } },
  { type: "message_stop" },
];

/** A streamed answer with two thinking blocks, text and two tool calls, as the API sends it. */
const answerEvents: Data[] = [
  messageStart,
  { type: "ping" },
  start(0, { type: "thinking", thinking: "" }),
  delta(0, { type: "thinking_delta", thinking: "Look it" }),
  delta(0, { type: "thinking_delta", thinking: " up." }),
  delta(0, { type: "signature_delta", signature: "test-signature-1" }),
  stop(0),
  start(1, { type: "text", text: "" }),
  text(1, "Searching "),
  delta(1, { type: "citations_delta", citation: {} }),
  text(1, "für 東京."),
  stop(1),
  start(2, { type: "tool_use", id: "toolu_1", name: "search", input: {} }),
  json(2, '{"q": "ac'),
  json(2, 'me"}'),
  stop(2),
  start(3, { type: "thinking", thinking: "Then read." }),
  stop(3),
  start(4, { type: "tool_use", id: "toolu_2", name: "close", input: {} }),
  stop(4),
  ...messageEnd,
];

verifies("model-anthropic.stream", () => {
  it("gives text, reasoning and tool call pieces that add up to the answer", () => {
    const pieces = readAll(new MessageStreamReader(), answerEvents);
    expect(pieces).toEqual([
      { type: "reasoning", delta: "Look it" },
      { type: "reasoning", delta: " up." },
      { type: "text", delta: "Searching " },
      { type: "text", delta: "für 東京." },
      { type: "tool-call", index: 0, id: "toolu_1", name: "search", arguments: "" },
      { type: "tool-call", index: 0, arguments: '{"q": "ac' },
      { type: "tool-call", index: 0, arguments: 'me"}' },
      { type: "reasoning", delta: "\n\nThen read." },
      { type: "tool-call", index: 1, id: "toolu_2", name: "close", arguments: "" },
    ]);
  });

  it("finishes with what chat() reads from the same message, sent without streaming", () => {
    const reader = new MessageStreamReader();
    readAll(reader, answerEvents);
    const blocks = [
      { type: "thinking", thinking: "Look it up.", signature: "test-signature-1" },
      { type: "text", text: "Searching für 東京." },
      { type: "tool_use", id: "toolu_1", name: "search", input: { q: "acme" } },
      { type: "thinking", thinking: "Then read." },
      { type: "tool_use", id: "toolu_2", name: "close", input: {} },
    ];
    const sent = {
      content: blocks,
      stop_reason: "tool_use",
      usage: { input_tokens: 25, output_tokens: 15 },
    };
    expect(reader.finish()).toEqual(readReply(sent));
    expect(reader.finish()).toMatchObject({
      content: "Searching für 東京.",
      reasoning: "Look it up.\n\nThen read.",
      usage: { inputTokens: 25, outputTokens: 15 },
      finishReason: "tool_calls",
    });
  });

  it("takes message_delta's usage as the total so far, field by field, never added up", () => {
    const reader = new MessageStreamReader();
    readAll(reader, [
      messageStart,
      { type: "message_delta", delta: {}, usage: { output_tokens: 7 } },
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { input_tokens: 30, output_tokens: 9 },
      },
      { type: "message_stop" },
    ]);
    expect(reader.finish().usage).toEqual({ inputTokens: 30, outputTokens: 9 });
  });

  it("keeps message_start's counts where message_delta's usage sends null", () => {
    const reader = new MessageStreamReader();
    readAll(reader, [
      {
        type: "message_start",
        message: {
          ...(messageStart["message"] as Data),
          usage: {
            input_tokens: 25,
            output_tokens: 1,
            cache_read_input_tokens: 40,
            cache_creation_input_tokens: 12,
          },
        },
      },
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: {
          input_tokens: null,
          output_tokens: 9,
          cache_read_input_tokens: null,
          cache_creation_input_tokens: null,
        },
      },
      { type: "message_stop" },
    ]);
    // The cache counts aren't read into our usage yet; this keeps passing once they are.
    expect(reader.finish().usage).toMatchObject({ inputTokens: 25, outputTokens: 9 });
  });

  it("gives text a block starts with, and no piece for empty text", () => {
    const reader = new MessageStreamReader();
    const pieces = readAll(reader, [
      messageStart,
      start(0, { type: "text", text: "Hi" }),
      text(0, ""),
    ]);
    expect(pieces).toEqual([{ type: "text", delta: "Hi" }]);
  });
});

verifies("model-anthropic.stream-errors", () => {
  const failures: Array<[string, Data[], RegExp]> = [
    ["a delta for a block that never started", [messageStart, text(0, "Hi")], /never started/],
    ["a block event without an index", [messageStart, { type: "content_block_stop" }], /no index/],
    [
      "a tool input that isn't a JSON object",
      [messageStart, start(0, { type: "tool_use", id: "t", name: "n" }), json(0, "[1]"), stop(0)],
      /isn't a JSON object/,
    ],
    [
      "a tool input that isn't JSON",
      [messageStart, start(0, { type: "tool_use", id: "t", name: "n" }), json(0, '{"q'), stop(0)],
      /isn't JSON/,
    ],
  ];
  for (const [what, events, message] of failures) {
    it(`refuses ${what}`, () => {
      const read = () => readAll(new MessageStreamReader(), events);
      expect(read).toThrow(ReplyFormatError);
      expect(read).toThrow(message);
    });
  }

  it("refuses event data that isn't a JSON object", () => {
    const reader = new MessageStreamReader();
    expect(() => reader.read("[]")).toThrow(ReplyFormatError);
    expect(() => reader.read("{")).toThrow(ReplyFormatError);
  });

  it("throws the API's text on an error event", () => {
    const reader = new MessageStreamReader();
    const error = { type: "error", error: { type: "overloaded_error", message: "Overloaded" } };
    expect(() => readAll(reader, [messageStart, error])).toThrow(StreamedVendorError);
    expect(() => readAll(reader, [messageStart, error])).toThrow(
      expect.objectContaining({
        message: "Overloaded",
        vendorType: "overloaded_error",
        vendorText: "Overloaded",
      }),
    );
    expect(() => readAll(reader, [{ type: "error" }])).toThrow(
      expect.objectContaining({ message: "error event", vendorType: "", vendorText: "" }),
    );
  });

  it("refuses to finish a stream that ended before message_stop", () => {
    const reader = new MessageStreamReader();
    readAll(reader, [messageStart, start(0, { type: "text", text: "Hel" })]);
    expect(() => reader.finish()).toThrow(ReplyFormatError);
  });
});
