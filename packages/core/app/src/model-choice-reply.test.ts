import { ModelCallError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { ModelChoice } from "./model-choice.ts";
import { modelTestRequest, readTestReply, testOutcome } from "./model-choice-reply.ts";

const anthropicKey: ModelChoice = { kind: "key", provider: "anthropic" };
const llama: ModelChoice = { kind: "local", model: "llama3.2" };

function reply(content: string, toolCalls: { name: string }[] = []) {
  return {
    reply: {
      content,
      toolCalls: toolCalls.map((call, index) => ({ id: `call-${index}`, arguments: {}, ...call })),
      usage: { inputTokens: 40, outputTokens: 1 },
      finishReason: "stop" as const,
    },
  };
}

function failed(reason: ConstructorParameters<typeof ModelCallError>[0]) {
  return { error: new ModelCallError(reason, "The provider said no.") };
}

const timedOut = { error: new DOMException("The operation was aborted.", "AbortError") };

verifies("app.model-choice-test-call", () => {
  it("asks the choice's model for the Sorter's one-word reply, with no tools", () => {
    const request = modelTestRequest(anthropicKey);
    expect(request.model).toBe("claude-haiku-5-5");
    expect(request.tools).toBeUndefined();
    expect(request.params).toBeUndefined();
    expect(request.messages[0]?.content).toContain(
      "Reply with exactly one of: refund, question, spam. No other words.",
    );
    expect(request.messages[1]).toEqual({
      role: "user",
      content: expect.stringContaining("Can I get a refund?"),
    });
  });

  it("passes the caller's signal on, which carries the time limit", () => {
    const limit = new AbortController();
    expect(modelTestRequest(llama, limit.signal)).toMatchObject({
      model: "llama3.2",
      signal: limit.signal,
    });
  });
});

verifies("app.model-choice-ok", () => {
  it("passes a key whose model answered, whatever the form", () => {
    expect(testOutcome(anthropicKey, reply("Refund."))).toBe("ok");
  });

  it("passes a local model that answers with one label", () => {
    expect(testOutcome(llama, reply(" refund \n"))).toBe("ok");
  });
});

verifies("app.model-choice-key-refused", () => {
  it.each(["key-refused", "no-key"] as const)("reads %s as a key not accepted", (reason) => {
    expect(testOutcome(anthropicKey, failed(reason))).toBe("key-refused");
  });
});

verifies("app.model-choice-no-credit", () => {
  it("reads out-of-credit as no credit", () => {
    expect(testOutcome(anthropicKey, failed("out-of-credit"))).toBe("no-credit");
  });
});

verifies("app.model-choice-offline", () => {
  it("reads offline as no network", () => {
    expect(testOutcome(anthropicKey, failed("offline"))).toBe("offline");
  });
});

verifies("app.model-choice-provider-error", () => {
  it.each(["timeout", "provider-busy", "refused", "model-missing"] as const)(
    "reads %s as the provider not answering",
    (reason) => {
      expect(testOutcome(anthropicKey, failed(reason))).toBe("provider-error");
    },
  );

  it("reads the time limit's abort, and any other error, as the provider not answering", () => {
    expect(testOutcome(anthropicKey, timedOut)).toBe("provider-error");
    expect(testOutcome(anthropicKey, { error: new TypeError("fetch failed") })).toBe(
      "provider-error",
    );
  });
});

verifies("app.model-choice-local-not-answering", () => {
  it.each([
    ["Ollama not running", failed("offline")],
    ["the model still loading at the time limit", timedOut],
    ["the model not downloaded", failed("model-missing")],
  ])("reads %s as the local model not answering", (_, result) => {
    expect(testOutcome(llama, result)).toBe("local-not-answering");
  });
});

verifies("app.model-choice-local-not-usable", () => {
  it.each([
    ["a sentence", reply("I think this is a refund request.")],
    ["another case", reply("Refund")],
    ["nothing", reply("")],
    ["a tool call", reply("refund", [{ name: "lookup_order" }])],
  ])("reads %s as an answer the workflow can't use", (_, result) => {
    expect(testOutcome(llama, result)).toBe("local-not-usable");
    expect(readTestReply(result.reply)).toBe("not-usable");
  });
});
