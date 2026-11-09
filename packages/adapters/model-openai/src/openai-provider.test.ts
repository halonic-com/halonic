import { isModelCallError, type ModelCallErrorReason } from "@halonicjs/ports";
import { chatRequest, llmProviderContract, textAnswer } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  OpenAiCompatibleProvider,
  type OpenAiCompatibleProviderOptions,
} from "./openai-provider.ts";
import { ScriptedVendor } from "./test/scripted-vendor.ts";

/** A provider in front of a fresh scripted vendor. */
function providerWith(options: Partial<OpenAiCompatibleProviderOptions> = {}) {
  const vendor = new ScriptedVendor();
  const provider = new OpenAiCompatibleProvider({
    id: "acme",
    type: "openai-compatible",
    baseUrl: "http://acme.test/v1",
    http: vendor,
    ...options,
  });
  return { vendor, provider };
}

/** The error `chat` fails with after `script` sets up the vendor. */
async function failureOf(script: (vendor: ScriptedVendor) => void, request = chatRequest()) {
  const { vendor, provider } = providerWith();
  script(vendor);
  const error: unknown = await provider.chat(request).catch((thrown: unknown) => thrown);
  return { error: error as Error, vendor };
}

llmProviderContract(
  "openai-compatible",
  async () => {
    const { vendor, provider } = providerWith();
    return {
      provider,
      answerNext: (answer) => vendor.answerNext(answer),
      hangNext: () => vendor.hangNext(),
      refuseNext: () => vendor.replyNext(401, { error: { message: "Incorrect API key provided" } }),
      calls: () => vendor.calls(),
    };
  },
  // LM Studio and Ollama send the reasoning of thinking models, so the suite checks it.
  { streams: false, reasoning: true },
);

verifies("model-openai.endpoint", () => {
  it("posts to the chat completions address, without following redirects", async () => {
    const { vendor, provider } = providerWith({ baseUrl: "http://acme.test/v1/" });
    vendor.answerNext(textAnswer);
    await provider.chat(chatRequest());
    expect(vendor.received[0]).toMatchObject({
      url: "http://acme.test/v1/chat/completions",
      method: "POST",
      redirect: "error",
    });
  });

  it("sends the key only in the Authorization header, and no header without one", async () => {
    const keyed = providerWith({ key: async () => "test-key-1" });
    keyed.vendor.answerNext(textAnswer);
    await keyed.provider.chat(chatRequest());
    expect(keyed.vendor.received[0]?.headers["authorization"]).toBe("Bearer test-key-1");
    expect(JSON.stringify(keyed.vendor.received[0]?.body)).not.toContain("test-key-1");

    const open = providerWith();
    open.vendor.answerNext(textAnswer);
    await open.provider.chat(chatRequest());
    expect(open.vendor.received[0]?.headers).not.toHaveProperty("authorization");
  });
});

verifies("model-openai.call-errors", () => {
  const cases: Array<[string, (vendor: ScriptedVendor) => void, ModelCallErrorReason, RegExp]> = [
    [
      "a turned away key",
      (v) => v.replyNext(401, { error: { message: "Incorrect API key provided: sk-abc" } }),
      "refused",
      /^acme turned the key away \(HTTP 401\)$/,
    ],
    [
      "a missing model",
      (v) => v.replyNext(404, { error: 'model "acme-small" not found' }),
      "model-missing",
      /has no model "acme-small".*not found/,
    ],
    [
      "a model without tools",
      (v) => v.replyNext(400, { error: "acme-small does not support tools" }),
      "model-no-tools",
      /can't call tools/,
    ],
    [
      "a rate limit",
      (v) => v.replyNext(429, { error: { message: "Slow down" } }),
      "refused",
      /HTTP 429: Slow down\)$/,
    ],
    [
      "an error body in another format",
      (v) => v.replyNext(502, { detail: "busy" }),
      "refused",
      /HTTP 502: \{"detail":"busy"\}\)$/,
    ],
    [
      "a key in the vendor's text",
      (v) => v.replyNext(500, { error: "bad key sk-Abcdefghijklmnop1234" }),
      "refused",
      /\(HTTP 500\)$/,
    ],
    ["no network", (v) => v.unreachableNext(), "offline", /could not be reached/],
    [
      "a reply in another format",
      (v) => v.replyNext(200, { result: "hi" }),
      "refused",
      /format we can't read/,
    ],
  ];
  for (const [what, script, reason, message] of cases) {
    it(`fails with ${reason} on ${what}, and closes the call`, async () => {
      const { error, vendor } = await failureOf(script);
      expect(isModelCallError(error) && error.reason).toBe(reason);
      expect(error.message).toMatch(message);
      expect(vendor.calls().open).toBe(0);
    });
  }

  it("says refused, not model-no-tools, when the request offered no tools", async () => {
    const { error } = await failureOf(
      (v) => v.replyNext(400, { error: "acme-small does not support tools" }),
      { model: "acme-small", messages: [] },
    );
    expect(isModelCallError(error) && error.reason).toBe("refused");
  });
});
