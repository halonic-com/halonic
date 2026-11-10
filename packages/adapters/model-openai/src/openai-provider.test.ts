import { isModelCallError, isVendorErrorText, type ModelCallErrorReason } from "@halonicjs/ports";
import { chatRequest, llmProviderContract, textAnswer } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import {
  OpenAiCompatibleProvider,
  type OpenAiCompatibleProviderOptions,
} from "./openai-provider.ts";
import { ReplyFormatError } from "./reply.ts";
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

/** The vendor's own text on `error`'s cause, or undefined when it has none. */
function vendorTextOf(error: Error): string | undefined {
  return isVendorErrorText(error.cause) ? error.cause.message : undefined;
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
      hangNext: (partialText) => vendor.hangNext(partialText),
      refuseNext: () => vendor.replyNext(400, { error: { message: "max_tokens is too large" } }),
      calls: () => vendor.calls(),
    };
  },
  // LM Studio and Ollama send the reasoning of thinking models, so the suite checks it.
  { streams: true, reasoning: true },
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
  // [what, vendor script, reason, message, the vendor's text on `cause`]
  const cases: Array<
    [string, (vendor: ScriptedVendor) => void, ModelCallErrorReason, RegExp, string | undefined]
  > = [
    [
      "a key it doesn't accept",
      (v) => v.replyNext(401, { error: { message: "Incorrect API key provided: sk-abc" } }),
      "key-refused",
      /^acme didn't accept the key \(HTTP 401\)$/,
      undefined,
    ],
    [
      "a missing model",
      (v) => v.replyNext(404, { error: 'model "acme-small" not found' }),
      "model-missing",
      /^acme doesn't have the model "acme-small" \(HTTP 404\)$/,
      'model "acme-small" not found',
    ],
    [
      "a model without tools",
      (v) => v.replyNext(400, { error: "acme-small does not support tools" }),
      "model-no-tools",
      /^"acme-small" on acme can't use tools, and this call offered tools \(HTTP 400\)$/,
      "acme-small does not support tools",
    ],
    [
      "a rate limit",
      (v) => v.replyNext(429, { error: { message: "Slow down", type: "requests" } }),
      "provider-busy",
      /^acme was busy and couldn't take the call to the model "acme-small" \(HTTP 429\)$/,
      "Slow down",
    ],
    [
      "a used up quota",
      (v) =>
        v.replyNext(429, {
          error: { message: "You exceeded your quota", type: "insufficient_quota", code: null },
        }),
      "out-of-credit",
      /^acme refused the call to the model "acme-small" because the account has no credit left or reached its limit \(HTTP 429\)$/,
      "You exceeded your quota",
    ],
    [
      "a payment required",
      (v) => v.replyNext(402, { error: "Insufficient credits" }),
      "out-of-credit",
      /\(HTTP 402\)$/,
      "Insufficient credits",
    ],
    [
      "a spend limit, named by its code",
      (v) =>
        v.replyNext(429, {
          error: {
            message: "Your project has reached its spend limit",
            type: "requests",
            code: "project_spend_limit_exceeded",
          },
        }),
      "out-of-credit",
      /\(HTTP 429\)$/,
      "Your project has reached its spend limit",
    ],
    [
      "an overloaded server",
      (v) =>
        v.replyNext(503, {
          error: { message: "The server is overloaded", code: "server_is_overloaded" },
        }),
      "provider-busy",
      /\(HTTP 503\)$/,
      "The server is overloaded",
    ],
    [
      "Groq's full flex tier",
      (v) => v.replyNext(498, { error: { message: "Flex tier capacity exceeded" } }),
      "provider-busy",
      /\(HTTP 498\)$/,
      "Flex tier capacity exceeded",
    ],
    [
      "a 403 about the country, not the key",
      (v) =>
        v.replyNext(403, {
          error: {
            message: "Country, region, or territory not supported",
            code: "unsupported_country_region_territory",
          },
        }),
      "refused",
      /^acme refused the call to the model "acme-small" \(HTTP 403\)$/,
      "Country, region, or territory not supported",
    ],
    [
      "a 403 about the model that repeats OpenAI's masked key",
      (v) =>
        v.replyNext(403, {
          error: { message: "Project with key sk-proj-****abcd has no access to model acme-small" },
        }),
      "refused",
      /^acme refused the call to the model "acme-small" \(HTTP 403\)$/,
      undefined,
    ],
    [
      "a request it turns down",
      (v) => v.replyNext(400, { error: { message: "max_tokens is too large" } }),
      "refused",
      /^acme refused the call to the model "acme-small" \(HTTP 400\)$/,
      "max_tokens is too large",
    ],
    [
      "an error body in another format",
      (v) => v.replyNext(502, { detail: "busy" }),
      "provider-busy",
      /\(HTTP 502\)$/,
      '{"detail":"busy"}',
    ],
    [
      "a key in the vendor's text",
      (v) => v.replyNext(500, { error: "bad key sk-Abcdefghijklmnop1234" }),
      "provider-busy",
      /\(HTTP 500\)$/,
      undefined,
    ],
    [
      "no network",
      (v) => v.unreachableNext(),
      "offline",
      /^Halonic couldn't reach acme at acme\.test$/,
      undefined,
    ],
    [
      "a reply in another format",
      (v) => v.replyNext(200, { result: "hi" }),
      "refused",
      /^acme answered for the model "acme-small" in a form Halonic can't read$/,
      undefined,
    ],
  ];
  for (const [what, script, reason, message, vendorText] of cases) {
    it(`fails with ${reason} on ${what}, and closes the call`, async () => {
      const { error, vendor } = await failureOf(script);
      expect(isModelCallError(error) && error.reason).toBe(reason);
      expect(error.message).toMatch(message);
      expect(vendorTextOf(error)).toBe(vendorText);
      expect(vendor.calls().open).toBe(0);
    });
  }

  it("fails with the abort's reason when the call is stopped while the error text is read", async () => {
    const stop = new AbortController();
    const reason = new Error("stopped by the user");
    // The server answers 500, and the call is stopped while its text comes in.
    const errorText = new ReadableStream<Uint8Array>({
      pull(controller) {
        stop.abort(reason);
        controller.error(new TypeError("terminated"));
      },
    });
    const { provider } = providerWith({
      http: { fetch: async () => new Response(errorText, { status: 500 }) },
    });
    const error: unknown = await provider
      .chat({ ...chatRequest(), signal: stop.signal })
      .catch((thrown: unknown) => thrown);
    expect(error).toBe(reason);
  });

  it("says refused, not model-no-tools, when the request offered no tools", async () => {
    const { error } = await failureOf(
      (v) => v.replyNext(400, { error: "acme-small does not support tools" }),
      { model: "acme-small", messages: [] },
    );
    expect(isModelCallError(error) && error.reason).toBe("refused");
  });
});

verifies("model-openai.call-error-details", () => {
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

  it("drops the server's text when it holds the call's own key, whatever its shape", async () => {
    // A made-up key in a proxy's own format, which no key shape matches.
    const { vendor, provider } = providerWith({ key: async () => "proxy-0123" });
    vendor.replyNext(500, { error: { message: "bad key proxy-0123" } });
    const error = await provider.chat(chatRequest()).catch((thrown: unknown) => thrown);
    expect(isModelCallError(error) && error.message).toMatch(/\(HTTP 500\)$/);
    expect(vendorTextOf(error as Error)).toBeUndefined();
  });

  it("names the host that couldn't be reached, without the path", async () => {
    const { error } = await failureOf((v) => v.unreachableNext());
    expect(isModelCallError(error) && error.host).toBe("acme.test");
    const local = providerWith({ baseUrl: "http://localhost:11434/v1" });
    local.vendor.unreachableNext();
    const offline = await local.provider.chat(chatRequest()).catch((thrown: unknown) => thrown);
    expect(isModelCallError(offline) && offline.host).toBe("localhost:11434");
  });
  it("says only the provider when the address gives no host", async () => {
    const { vendor, provider } = providerWith({ baseUrl: "not an address" });
    vendor.unreachableNext();
    const error = await provider.chat(chatRequest()).catch((thrown: unknown) => thrown);
    expect(isModelCallError(error) && error.message).toBe("Halonic couldn't reach acme");
  });
});

verifies("model-openai.reply-size", () => {
  it("fails with refused on a reply over 10 MiB, and stops reading it", async () => {
    const { error, vendor } = await failureOf((v) => v.floodNext());
    expect(isModelCallError(error) && error.reason).toBe("refused");
    expect(error.message).toMatch(
      /^acme's answer for the model "acme-small" was over 10 MB, more than Halonic reads$/,
    );
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
    const { provider } = providerWith({ http: { fetch: async () => huge } });
    await expect(provider.chat(chatRequest())).rejects.toThrow(
      /^acme's answer for the model "acme-small" was over 10 MB, more than Halonic reads$/,
    );
    expect(cancelled).toBe(true);
  });

  it("fails a stream with refused on a body over 10 MiB with no line break, and stops reading it", async () => {
    const { vendor, provider } = providerWith();
    vendor.floodNext();
    const error = await drain(provider.stream(chatRequest())).catch((thrown: unknown) => thrown);
    expect(isModelCallError(error) && error.reason).toBe("refused");
    expect((error as Error).message).toMatch(
      /^acme's answer for the model "acme-small" was over 10 MB, more than Halonic reads$/,
    );
    expect(vendor.calls().open).toBe(0);
  });

  it("refuses a stream that declares a length over 10 MiB before reading it", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull: () => new Promise(() => {}),
      cancel() {
        cancelled = true;
      },
    });
    const huge = new Response(body, { headers: { "content-length": String(11 * 1024 * 1024) } });
    const { provider } = providerWith({ http: { fetch: async () => huge } });
    await expect(drain(provider.stream(chatRequest()))).rejects.toThrow(
      /^acme's answer for the model "acme-small" was over 10 MB, more than Halonic reads$/,
    );
    expect(cancelled).toBe(true);
  });
});

/** Reads `stream` to its end. */
async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _event of stream) {
    // Only the end matters.
  }
}

verifies("model-openai.call-errors", () => {
  /** The error a stream ends with when the server answers with `body`. */
  async function streamFailureOf(
    body: ReadableStream<Uint8Array> | string,
    key?: () => Promise<string>,
  ): Promise<Error> {
    const http = { fetch: async () => new Response(body) };
    const provider = new OpenAiCompatibleProvider({
      id: "acme",
      type: "openai",
      baseUrl: "http://acme.test/v1",
      http,
      ...(key === undefined ? {} : { key }),
    });
    try {
      for await (const _event of provider.stream(chatRequest())) {
        // Read to the end.
      }
    } catch (error) {
      return error as Error;
    }
    throw new Error("the stream ended without an error");
  }

  it("ends a stream with refused on a chunk it can't read", async () => {
    const error = await streamFailureOf("data: not json\n\n");
    expect(isModelCallError(error) && error.reason).toBe("refused");
  });

  it("ends a stream with offline when the connection drops mid-answer", async () => {
    const dropped = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'),
        );
        controller.error(new TypeError("terminated"));
      },
    });
    const error = await streamFailureOf(dropped);
    expect(isModelCallError(error) && error.reason).toBe("offline");
  });

  it("ends a stream with refused, and the vendor's text as its cause, on an error event after a 200", async () => {
    const error = await streamFailureOf(
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
        'data: {"error":{"message":"The server had an error while processing your request"}}\n\n',
    );
    expect(isModelCallError(error) && error.reason).toBe("refused");
    expect(error.message).toBe('acme stopped the answer from the model "acme-small" with an error');
    expect(vendorTextOf(error)).toBe("The server had an error while processing your request");
  });

  it("ends a stream with out-of-credit when its error event says the credit is used up", async () => {
    const error = await streamFailureOf(
      'data: {"error":{"message":"You exceeded your current quota","type":"insufficient_quota"}}\n\n',
    );
    expect(isModelCallError(error) && error.reason).toBe("out-of-credit");
    expect(vendorTextOf(error)).toBe("You exceeded your current quota");
  });

  it("drops the text of an error event that holds the call's own key", async () => {
    const event = 'data: {"error":{"message":"bad key proxy-0123"}}\n\n';
    const error = await streamFailureOf(event, async () => "proxy-0123");
    expect(isModelCallError(error) && error.reason).toBe("refused");
    expect(vendorTextOf(error)).toBeUndefined();
  });

  it("ends a stream with refused, as chat() does, when the server sends no chunks", async () => {
    // A server that ignores `stream: true` sends one whole reply; chat() can't read it either.
    const error = await streamFailureOf('{"error":"not found"}');
    expect(isModelCallError(error) && error.reason).toBe("refused");
    expect(isModelCallError(error) && error.cause).toBeInstanceOf(ReplyFormatError);
    expect(isModelCallError(await streamFailureOf(""))).toBe(true);
  });
});
