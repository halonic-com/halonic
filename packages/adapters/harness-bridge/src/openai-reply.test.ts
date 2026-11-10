import { encodeUtf8 } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
import { OpenAiReplyReader } from "./openai-reply.ts";

/** One server-sent event as the Responses API writes it: the type on the `event` line and in the data. */
function event(type: string, data: object) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

/** A response's usage, shaped as OpenAI sends it. */
function usage(input: number, output: number, cached = 0) {
  return {
    input_tokens: input,
    input_tokens_details: { cached_tokens: cached },
    output_tokens: output,
    output_tokens_details: { reasoning_tokens: 7 },
    total_tokens: input + output,
  };
}

/** Feeds `chunks` to a new reader as the body of a 200 reply of `contentType`. */
function read(contentType: string, ...chunks: string[]) {
  const reader = new OpenAiReplyReader();
  reader.started(200, new Headers({ "content-type": contentType }));
  for (const chunk of chunks) reader.received(encodeUtf8(chunk));
  return reader.reading();
}

const created = event("response.created", {
  sequence_number: 0,
  response: { id: "resp_1", status: "in_progress", usage: null },
});

describe("OpenAiReplyReader", () => {
  it("reads the usage of a stream from response.completed and its text from the deltas", () => {
    const stream = [
      created,
      event("response.output_text.delta", { item_id: "msg_1", delta: "Hel" }),
      event("response.output_text.delta", { item_id: "msg_1", delta: "lo" }),
      event("response.output_text.done", { item_id: "msg_1", text: "Hello" }),
      event("response.completed", {
        response: { id: "resp_1", status: "completed", usage: usage(100, 42, 20) },
      }),
    ].join("");
    // Cut mid-event, as the network may.
    const reading = read(
      "text/event-stream; charset=utf-8",
      stream.slice(0, 150),
      stream.slice(150),
    );

    // The 20 cached tokens are taken out of input_tokens; reasoning tokens stay in output_tokens.
    expect(reading).toEqual({
      usage: { inputTokens: 80, outputTokens: 42, cacheReadTokens: 20 },
      text: "Hello",
    });
  });

  it("reads events that carry their type only in the data", () => {
    const completed = { type: "response.completed", response: { usage: usage(5, 1) } };
    expect(read("text/event-stream", `data: ${JSON.stringify(completed)}\n\n`)).toEqual({
      usage: { inputTokens: 5, outputTokens: 1 },
      text: "",
    });
  });

  it("reads the usage of an incomplete or failed response, which OpenAI charges for", () => {
    for (const type of ["response.incomplete", "response.failed"]) {
      const end = event(type, { response: { status: type.slice(9), usage: usage(30, 4) } });
      expect(read("text/event-stream", created, end)?.usage).toEqual({
        inputTokens: 30,
        outputTokens: 4,
      });
    }
  });

  it("tells nothing of a stream cut short before its usage, because OpenAI sends usage last", () => {
    const delta = event("response.output_text.delta", { delta: "Hel" });
    expect(read("text/event-stream", created, delta)).toBeUndefined();
  });

  it("reads the usage and the text of a reply that isn't streamed", () => {
    const response = {
      id: "resp_1",
      object: "response",
      output: [
        { type: "reasoning", summary: [] },
        {
          type: "message",
          role: "assistant",
          content: [
            { type: "output_text", text: "Hi ", annotations: [] },
            { type: "refusal", refusal: "Not this part." },
            { type: "output_text", text: "there", annotations: [] },
          ],
        },
        { type: "function_call", name: "shell", arguments: "{}" },
      ],
      usage: usage(10, 3, 4),
    };
    expect(read("application/json", JSON.stringify(response))).toEqual({
      usage: { inputTokens: 6, outputTokens: 3, cacheReadTokens: 4 },
      text: "Hi there",
    });
  });

  it("skips counts that aren't token counts, and a usage with none", () => {
    const odd = { input_tokens: -1, output_tokens: 2.5 };
    const end = event("response.completed", { response: { usage: odd } });
    expect(read("text/event-stream", end)).toBeUndefined();
    expect(read("application/json", '{"usage":{"input_tokens":4}}')?.usage).toEqual({
      inputTokens: 4,
      outputTokens: 0,
    });
  });

  it("leaves out a cache read of 0, and never counts more cache reads than input", () => {
    const none = { input_tokens: 9, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1 };
    const tooMany = {
      input_tokens: 9,
      input_tokens_details: { cached_tokens: 50 },
      output_tokens: 1,
    };
    const odd = { input_tokens: 9, input_tokens_details: { cached_tokens: "9" }, output_tokens: 1 };
    expect(read("application/json", JSON.stringify({ usage: none }))?.usage).toEqual({
      inputTokens: 9,
      outputTokens: 1,
    });
    expect(read("application/json", JSON.stringify({ usage: tooMany }))?.usage).toEqual({
      inputTokens: 0,
      outputTokens: 1,
      cacheReadTokens: 9,
    });
    expect(read("application/json", JSON.stringify({ usage: odd }))?.usage).toEqual({
      inputTokens: 9,
      outputTokens: 1,
    });
  });

  it("reads nothing of an error reply, or of a reply that isn't JSON", () => {
    const reader = new OpenAiReplyReader();
    reader.started(429, new Headers({ "content-type": "application/json" }));
    reader.received(encodeUtf8(JSON.stringify({ usage: usage(1, 1) })));
    expect(reader.reading()).toBeUndefined();
    expect(read("application/json", '{"usage":')).toBeUndefined();
  });
});
