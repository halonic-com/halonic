import type { ChatRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { toWireBody } from "./request.ts";
import { takesSampling } from "./sampling.ts";

const plain = { stream: false } as const;

/** A call to `model` that sets every sampling setting, a stop sequence and a length limit. */
function samplingRequest(model: string): ChatRequest {
  return {
    model,
    messages: [{ role: "user", content: "Hi" }],
    params: { temperature: 0.3, topP: 0.9, stop: ["END"], maxTokens: 300, extra: { top_k: 40 } },
  };
}

verifies("model-anthropic.sampling", () => {
  it("leaves the sampling settings out for a model that refuses them", () => {
    const body = toWireBody(samplingRequest("claude-sonnet-5-5"), plain);
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
    expect(body).not.toHaveProperty("top_k");
  });

  it("keeps the stop sequences and the length limit for that model", () => {
    const body = toWireBody(samplingRequest("claude-opus-5-5"), plain);
    expect(body).toMatchObject({ max_tokens: 300, stop_sequences: ["END"] });
  });

  it("still sends them to Claude Haiku 4.5", () => {
    const body = toWireBody(samplingRequest("claude-haiku-4-5"), plain);
    expect(body).toMatchObject({
      temperature: 0.3,
      top_p: 0.9,
      top_k: 40,
      max_tokens: 300,
      stop_sequences: ["END"],
    });
  });

  describe("which models take them", () => {
    it.each([
      "claude-fable-5-1",
      "claude-fable-5",
      "claude-opus-5-5",
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-sonnet-5-5",
      "claude-sonnet-5",
    ])("%s refuses them", (model) => {
      expect(takesSampling(model)).toBe(false);
    });

    it.each([
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
      "claude-sonnet-4-5",
      "claude-opus-4-1",
      "claude-3-5-sonnet",
      "claude-3-haiku",
    ])("%s takes them", (model) => {
      expect(takesSampling(model)).toBe(true);
    });

    it.each([
      ["claude-opus-4-7[1m]", false],
      ["claude-opus-4-6[1m]", true],
      ["claude-haiku-4-5-20251001", true],
      ["claude-sonnet-4-20250514", true],
      ["claude-3-5-sonnet-latest", true],
      ["claude-opus-4-5@20251101", true],
      ["us.anthropic.claude-haiku-4-5-20251001-v1:0", true],
      ["anthropic.claude-opus-5-5", false],
      ["Claude-Sonnet-5-5", false],
    ])("matches the dated or platform id %s by its family", (model, takes) => {
      expect(takesSampling(model)).toBe(takes);
    });

    it("takes a Claude model it doesn't know to be a newer one, which refuses them", () => {
      expect(takesSampling("claude-opus-6")).toBe(false);
      expect(takesSampling("claude-haiku-5")).toBe(false);
    });

    it("lets a model with another name, such as one behind a proxy, take them", () => {
      expect(takesSampling("acme-small")).toBe(true);
    });
  });
});
