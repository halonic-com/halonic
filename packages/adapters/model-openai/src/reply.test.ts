import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parseArguments, ReplyFormatError, readFinishReason, readReply } from "./reply.ts";

/** A chat completions reply with one choice holding `message`. */
function replyWith(message: Record<string, unknown>, finishReason: string): unknown {
  return {
    choices: [
      { index: 0, message: { role: "assistant", ...message }, finish_reason: finishReason },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 },
  };
}

function toolCall(id: string, name: string, args: string): Record<string, unknown> {
  return { id, type: "function", function: { name, arguments: args } };
}

verifies("model-openai.replies", () => {
  it("reads the text, LM Studio's reasoning, the usage and the finish reason", () => {
    const body = replyWith({ content: "Hello.", reasoning_content: "Greet back." }, "length");
    expect(readReply(body)).toEqual({
      content: "Hello.",
      reasoning: "Greet back.",
      toolCalls: [],
      usage: { inputTokens: 12, outputTokens: 9 },
      finishReason: "length",
    });
  });

  it("reads tool calls in order with their arguments as objects", () => {
    const calls = [toolCall("call_1", "search", '{"q":"acme"}'), toolCall("call_2", "close", "")];
    const answer = readReply(replyWith({ content: null, tool_calls: calls }, "tool_calls"));
    expect(answer.content).toBe("");
    expect(answer.toolCalls).toEqual([
      { id: "call_1", name: "search", arguments: { q: "acme" } },
      { id: "call_2", name: "close", arguments: {} },
    ]);
  });

  it("reads Ollama's reasoning field and its stop reason on tool calls", () => {
    const calls = [toolCall("call_1", "search", '{"q":"acme"}')];
    const body = replyWith({ content: "", reasoning: "Look it up.", tool_calls: calls }, "stop");
    expect(readReply(body)).toMatchObject({ reasoning: "Look it up.", finishReason: "tool_calls" });
  });

  it("keeps `length` on tool calls, since their arguments may be cut off", () => {
    const calls = [toolCall("call_1", "search", '{"q":"ac')];
    const body = replyWith({ content: null, tool_calls: calls }, "length");
    expect(readReply(body).finishReason).toBe("length");
    expect(readFinishReason("content_filter", true)).toBe("other");
  });

  it("takes arguments sent as an object as they are", () => {
    const call = {
      id: "call_1",
      type: "function",
      function: { name: "search", arguments: { q: "acme" } },
    };
    const answer = readReply(replyWith({ content: null, tool_calls: [call] }, "tool_calls"));
    expect(answer.toolCalls[0]?.arguments).toEqual({ q: "acme" });
  });

  it("numbers tool calls the server sent without an id", () => {
    const calls = [
      { type: "function", function: { name: "search", arguments: "{}" } },
      { id: "", type: "function", function: { name: "close", arguments: "{}" } },
    ];
    const answer = readReply(replyWith({ content: null, tool_calls: calls }, "tool_calls"));
    expect(answer.toolCalls.map((call) => call.id)).toEqual(["call_0", "call_1"]);
  });

  it("passes tool arguments that aren't a JSON object on as input", () => {
    expect(parseArguments('{"q": "acme"')).toEqual({ input: '{"q": "acme"' });
    expect(parseArguments("[1,2]")).toEqual({ input: "[1,2]" });
    expect(parseArguments("  ")).toEqual({});
  });

  it("maps the vendor's finish reasons to ours", () => {
    const reasons = ["stop", "length", "tool_calls", "function_call", "content_filter", null];
    expect(reasons.map((reason) => readFinishReason(reason, false))).toEqual([
      "stop",
      "length",
      "tool_calls",
      "tool_calls",
      "other",
      "other",
    ]);
  });

  it("counts missing usage as zero and refuses a reply without a message", () => {
    expect(readReply({ choices: [{ message: { content: "Hi" } }] }).usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(() => readReply({ result: "Hi" })).toThrow(ReplyFormatError);
    expect(() => readReply({ choices: [{ text: "Hi" }] })).toThrow(ReplyFormatError);
  });
});
