import type { ChatRequest, ChatStreamEvent } from "@halonicjs/ports";
import { textAnswer } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ScriptedLlmProvider } from "./llm-provider.ts";

function request(signal?: AbortSignal): ChatRequest {
  return {
    model: "acme-small",
    messages: [{ role: "user", content: "hi" }],
    ...(signal === undefined ? {} : { signal }),
  };
}

verifies("memory.llm-provider", () => {
  it("is called scripted and doesn't stream unless asked to", () => {
    const provider = new ScriptedLlmProvider();
    expect([provider.id, provider.type, provider.stream]).toEqual([
      "scripted",
      "scripted",
      undefined,
    ]);
    expect(new ScriptedLlmProvider({ id: "fake", streaming: true }).capabilities.streaming).toBe(
      true,
    );
  });

  it("rejects a call when nothing more is scripted", async () => {
    const provider = new ScriptedLlmProvider({ id: "fake" });
    await expect(provider.chat(request())).rejects.toThrow(
      "The scripted model fake has no more calls.",
    );
    expect(provider.calls()).toEqual({ started: 0, open: 0 });
  });

  it("rejects a hanging call that has no signal, instead of waiting forever", async () => {
    const provider = new ScriptedLlmProvider();
    provider.hangNext();
    await expect(provider.chat(request())).rejects.toThrow("needs a signal");
    expect(provider.calls()).toEqual({ started: 1, open: 0 });
  });

  it("streams in pieces of four characters, and stops at the next piece once aborted", async () => {
    const provider = new ScriptedLlmProvider({ streaming: true });
    provider.answerNext(textAnswer);
    const controller = new AbortController();
    const events: ChatStreamEvent[] = [];
    const reading = (async () => {
      for await (const event of provider.stream?.(request(controller.signal)) ?? []) {
        events.push(event);
        controller.abort();
      }
    })();
    await expect(reading).rejects.toThrow();
    expect(events).toEqual([{ type: "text", delta: "Hell" }]);
  });

  it("never splits a character that takes two UTF-16 units", async () => {
    const provider = new ScriptedLlmProvider({ streaming: true });
    provider.answerNext({ ...textAnswer, content: "ab👋cd" });
    const deltas: string[] = [];
    for await (const event of provider.stream?.(request()) ?? []) {
      if (event.type === "text") deltas.push(event.delta);
    }
    expect(deltas).toEqual(["ab👋c", "d"]);
  });

  it("keeps its own copy of a scripted answer", async () => {
    const provider = new ScriptedLlmProvider();
    const answer = structuredClone(textAnswer);
    provider.answerNext(answer);
    answer.content = "changed after scripting";
    expect((await provider.chat(request())).content).toBe(textAnswer.content);
  });

  it("streams nothing before waiting when a hang has no partial text", async () => {
    const provider = new ScriptedLlmProvider({ streaming: true });
    provider.hangNext();
    const controller = new AbortController();
    const iterator = provider.stream?.(request(controller.signal))[Symbol.asyncIterator]();
    const next = iterator?.next();
    controller.abort();
    await expect(next).rejects.toThrow();
  });
});
