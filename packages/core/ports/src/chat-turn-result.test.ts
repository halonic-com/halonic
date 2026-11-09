import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { ChatMessage, ChatTurnRefusal, ChatTurnResponse } from "./index.ts";

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
