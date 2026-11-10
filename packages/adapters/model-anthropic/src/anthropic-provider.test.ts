import { isModelCallError, ModelCallError, type ModelCallErrorReason } from "@halonicjs/ports";
import { chatRequest, llmProviderContract, textAnswer } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { AnthropicProvider, type AnthropicProviderOptions } from "./anthropic-provider.ts";
import { ScriptedVendor } from "./test/scripted-vendor.ts";

/** A provider in front of a fresh scripted vendor. The key is a made-up test value. */
function providerWith(options: Partial<AnthropicProviderOptions> = {}) {
  const vendor = new ScriptedVendor();
  const provider = new AnthropicProvider({
    id: "acme",
    http: vendor,
    key: async () => "test-key-1",
    ...options,
  });
  return { vendor, provider };
}

/** What `call` fails with, and the vendor, after `script` sets the vendor up. */
async function failureOf(
  script: (vendor: ScriptedVendor) => void,
  call: (provider: AnthropicProvider) => Promise<unknown>,
) {
  const { vendor, provider } = providerWith();
  script(vendor);
  const error: unknown = await call(provider).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  return { error: error as Error, vendor };
}

/** Text shaped like an Anthropic key, built here so the source holds none. */
const keyShapedText = `sk-ant-${"Xy1".repeat(8)}`;

const chat = (provider: AnthropicProvider) => provider.chat(chatRequest());

llmProviderContract(
  "anthropic",
  async () => {
    const { vendor, provider } = providerWith();
    return {
      provider,
      answerNext: (answer) => vendor.answerNext(answer),
      hangNext: () => vendor.hangNext(),
      refuseNext: () =>
        vendor.replyNext(401, {
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        }),
      calls: () => vendor.calls(),
    };
  },
  // Claude's extended thinking gives a summary of its reasoning. Streaming comes next.
  { streams: false, reasoning: true },
);

verifies("model-anthropic.endpoint", () => {
  it("posts to the Messages address with the API version, without following redirects", async () => {
    const { vendor, provider } = providerWith({ baseUrl: "https://proxy.acme.test/" });
    vendor.answerNext(textAnswer);
    await provider.chat(chatRequest());
    expect(vendor.received[0]).toMatchObject({
      url: "https://proxy.acme.test/v1/messages",
      method: "POST",
      redirect: "error",
      headers: { "anthropic-version": "2023-06-01", "content-type": "application/json" },
    });
    expect(provider.type).toBe("anthropic");
  });

  it("accepts a base URL that already ends in /v1", async () => {
    for (const baseUrl of ["https://proxy.acme.test/v1", "https://proxy.acme.test/v1/"]) {
      const { vendor, provider } = providerWith({ baseUrl });
      vendor.answerNext(textAnswer);
      await provider.chat(chatRequest());
      expect(vendor.received[0]?.url).toBe("https://proxy.acme.test/v1/messages");
    }
  });

  it("uses Anthropic's own address by default, and sends the key only in x-api-key", async () => {
    const { vendor, provider } = providerWith();
    vendor.answerNext(textAnswer);
    await provider.chat(chatRequest());
    const [call] = vendor.received;
    expect(call?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call?.headers["x-api-key"]).toBe("test-key-1");
    expect(JSON.stringify(call?.body)).not.toContain("test-key-1");
  });

  it("fails with the key's own error, before reaching the vendor, when the key isn't set", async () => {
    const noKey = new ModelCallError("no-key", 'secret "anthropic-key" is not set');
    const { vendor, provider } = providerWith({ key: () => Promise.reject(noKey) });
    await expect(provider.chat(chatRequest())).rejects.toBe(noKey);
    expect(vendor.calls().started).toBe(0);
  });
});

verifies("model-anthropic.call-errors", () => {
  const vendorError = (type: string, message: string) => ({
    type: "error",
    error: { type, message },
  });
  const cases: Array<[string, (vendor: ScriptedVendor) => void, ModelCallErrorReason, RegExp]> = [
    [
      "a turned away key",
      (v) => v.replyNext(403, vendorError("permission_error", "Your key test-key-1 can't")),
      "refused",
      /^acme turned the key away \(HTTP 403\)$/,
    ],
    [
      "a missing model",
      (v) => v.replyNext(404, vendorError("not_found_error", "model: acme-small")),
      "model-missing",
      /has no model "acme-small" \(HTTP 404: model: acme-small\)$/,
    ],
    [
      "an overload",
      (v) => v.replyNext(529, vendorError("overloaded_error", "Overloaded")),
      "refused",
      /\(HTTP 529: Overloaded\)$/,
    ],
    [
      "an error body in another format",
      (v) => v.replyNext(502, { detail: "busy" }),
      "refused",
      /HTTP 502: \{"detail":"busy"\}\)$/,
    ],
    [
      "a key in the vendor's text",
      (v) => v.replyNext(500, vendorError("api_error", `bad key ${keyShapedText}`)),
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
      const { error, vendor } = await failureOf(script, chat);
      expect(isModelCallError(error) && error.reason).toBe(reason);
      expect(error.message).toMatch(message);
      expect(vendor.calls().open).toBe(0);
    });
  }
});

verifies("model-anthropic.call-error-details", () => {
  it("fails with the abort's reason when the signal aborts while the error body is read", async () => {
    const { vendor, provider } = providerWith();
    vendor.stallNext(500);
    const controller = new AbortController();
    const reason = new Error("stopped by the run");
    const pending = provider.chat({ ...chatRequest(), signal: controller.signal });
    await vi.waitFor(() => expect(vendor.calls().started).toBe(1));
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(vendor.calls().open).toBe(0);
  });

  it("drops the API's text when it holds the call's own key, whatever its shape", async () => {
    // A made-up key in a proxy's own format, which no key shape matches.
    const { vendor, provider } = providerWith({ key: async () => "proxy-0123" });
    vendor.replyNext(500, { type: "error", error: { message: "bad key proxy-0123" } });
    const error = await provider.chat(chatRequest()).catch((thrown: unknown) => thrown);
    expect(isModelCallError(error) && error.message).toMatch(/\(HTTP 500\)$/);
  });

  it("names the host that couldn't be reached, without the path", async () => {
    const { vendor, provider } = providerWith({ baseUrl: "http://localhost:8080/anthropic" });
    vendor.unreachableNext();
    const error = await provider.chat(chatRequest()).catch((thrown: unknown) => thrown);
    expect(isModelCallError(error) && error.host).toBe("localhost:8080");
  });
});

verifies("model-anthropic.reply-size", () => {
  it("fails with refused on a reply over 10 MiB, and stops reading it", async () => {
    const { error, vendor } = await failureOf((v) => v.floodNext(), chat);
    expect(isModelCallError(error) && error.reason).toBe("refused");
    expect(error.message).toMatch(/with more than 10485760 bytes$/);
    expect(vendor.calls().open).toBe(0);
  });

  it("refuses a reply that declares a length over 10 MiB before reading it", async () => {
    let cancelled = false;
    // Sends nothing: the provider must not wait for the body.
    const body = new ReadableStream<Uint8Array>({
      pull: () => new Promise(() => {}),
      cancel() {
        cancelled = true;
      },
    });
    const huge = new Response(body, { headers: { "content-length": String(11 * 1024 * 1024) } });
    const provider = new AnthropicProvider({
      id: "acme",
      http: { fetch: async () => huge },
      key: async () => "test-key-1",
    });
    await expect(provider.chat(chatRequest())).rejects.toThrow(/with more than 10485760 bytes$/);
    expect(cancelled).toBe(true);
  });
});
