import type { ChatParams, ChatRequest, ChatStreamEvent } from "@halonicjs/ports";
import { chatRequest, textAnswer } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { AnthropicProvider } from "./anthropic-provider.ts";
import { ScriptedVendor } from "./test/scripted-vendor.ts";

/** A provider whose scripted vendor answers the next call with the contract text answer. The key is a made-up test value. */
function answeringProvider() {
  const vendor = new ScriptedVendor();
  vendor.answerNext(textAnswer);
  return new AnthropicProvider({ id: "acme", http: vendor, key: async () => "test-key-1" });
}

function requestTo(model: string, params?: ChatParams): ChatRequest {
  return { ...chatRequest(), model, ...(params === undefined ? {} : { params }) };
}

verifies("model-anthropic.sampling-notes", () => {
  it("notes a setting it left out, and answers", async () => {
    const answer = await answeringProvider().chat(
      requestTo("claude-sonnet-5-5", { temperature: 0.3 }),
    );

    expect(answer.notes).toEqual(["Left out temperature: claude-sonnet-5-5 doesn't take it."]);
    expect(answer.content).toBe(textAnswer.content);
  });

  it("notes each setting a streamed call left out on its done answer", async () => {
    const model = "claude-opus-4-7[1m]";
    const request = requestTo(model, { topP: 0.9, extra: { top_k: 40 } });
    const events: ChatStreamEvent[] = [];
    for await (const event of answeringProvider().stream(request)) events.push(event);

    const done = events.at(-1);
    expect(done?.type === "done" ? done.response.notes : undefined).toEqual([
      `Left out top_p: ${model} doesn't take it.`,
      `Left out top_k: ${model} doesn't take it.`,
    ]);
  });

  it.each([
    ["sets no sampling setting", requestTo("claude-sonnet-5-5", { maxTokens: 200 })],
    ["goes to a model that takes them", requestTo("claude-haiku-4-5", { temperature: 0.3 })],
  ])("adds no notes to a call that %s", async (_why, request) => {
    const answer = await answeringProvider().chat(request);

    expect(answer).not.toHaveProperty("notes");
  });
});
