import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { ChatResponse, ChatStreamEvent } from "./index.ts";
import { portVersions } from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const plain: ChatResponse = {
  content: "Hello",
  toolCalls: [],
  usage: { inputTokens: 3, outputTokens: 2 },
  finishReason: "stop",
};

verifies("ports.provider-notes", () => {
  typeTest("keeps notes optional, as a list of sentences", () => {
    expectTypeOf<ChatResponse["notes"]>().toEqualTypeOf<string[] | undefined>();
  });

  it("takes a response with notes and one without", () => {
    const noted: ChatResponse = {
      ...plain,
      notes: ["Left out temperature: claude-sonnet-5-5 doesn't take it."],
    };
    const done: ChatStreamEvent = { type: "done", response: noted };
    expect(plain.notes).toBeUndefined();
    expect(done.response.notes).toHaveLength(1);
  });

  it("needs a list, not one sentence", () => {
    // @ts-expect-error: notes is a list of sentences
    const single: ChatResponse = { ...plain, notes: "Left out temperature." };
    expect(single).toBeDefined();
  });

  it("keeps the provider port at version 1", () => {
    expect(portVersions.LlmProvider).toBe(1);
  });
});
