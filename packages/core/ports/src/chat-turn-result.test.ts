import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { ChatMessage, ChatTurnRefusal, ChatTurnResponse, ChatTurnSkip } from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const plain: ChatTurnResponse = {
  model: "scripted",
  content: "Hello",
  toolCalls: [],
  usage: { inputTokens: 3, outputTokens: 2 },
  finishReason: "stop",
};

verifies("ports.chat-turn-result", () => {
  typeTest("keeps turn and refusals optional", () => {
    expectTypeOf<ChatTurnResponse["turn"]>().toEqualTypeOf<ChatMessage[] | undefined>();
    expectTypeOf<ChatTurnResponse["refusals"]>().toEqualTypeOf<ChatTurnRefusal[] | undefined>();
    expectTypeOf(plain).toMatchTypeOf<ChatTurnResponse>();
  });

  typeTest("accepts only the kinds of refusal a turn makes", () => {
    expectTypeOf<ChatTurnRefusal["refused"]>().toEqualTypeOf<
      "listing" | "tool" | "keyword" | "call"
    >();
    // @ts-expect-error: a call that needs approval is refused as a call
    expectTypeOf<"approval">().toMatchTypeOf<ChatTurnRefusal["refused"]>();
  });

  it("carries the turn's messages and a refused call as data", () => {
    const response: ChatTurnResponse = {
      ...plain,
      turn: [
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_1", name: "mail__send", arguments: {} }],
        },
        { role: "tool", toolCallId: "call_1", name: "mail__send", content: "Refused: needs OK" },
      ],
      refusals: [{ source: "mail", name: "mail__send", refused: "call", reason: "needs OK" }],
    };
    expect(response.turn).toHaveLength(2);
    expect(response.refusals?.[0]).toEqual({
      source: "mail",
      name: "mail__send",
      refused: "call",
      reason: "needs OK",
    });
  });
});

verifies("ports.chat-turn-skipped", () => {
  typeTest("keeps skipped optional", () => {
    expectTypeOf<ChatTurnResponse["skipped"]>().toEqualTypeOf<ChatTurnSkip[] | undefined>();
    expectTypeOf(plain).toMatchTypeOf<ChatTurnResponse>();
  });

  typeTest("skips a model only for a missing key", () => {
    expectTypeOf<ChatTurnSkip["reason"]>().toEqualTypeOf<"no-key">();
    // @ts-expect-error: an offline model was called, so it isn't skipped
    expectTypeOf<"offline">().toMatchTypeOf<ChatTurnSkip["reason"]>();
  });

  it("carries the skipped alias, why and the alias tried instead", () => {
    const response: ChatTurnResponse = {
      ...plain,
      skipped: [
        { alias: "smart", provider: "anthropic", model: "big", reason: "no-key", next: "default" },
      ],
    };
    expect(response.skipped?.[0]).toEqual({
      alias: "smart",
      provider: "anthropic",
      model: "big",
      reason: "no-key",
      next: "default",
    });
  });
});
