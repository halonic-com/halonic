import {
  type ChatStreamEvent,
  isModelCallError,
  type ModelCallErrorReason,
} from "@halonicjs/ports";
import { chatRequest, textAnswer } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { AnthropicProvider } from "./anthropic-provider.ts";
import { VendorErrorText } from "./call-error.ts";
import { ScriptedVendor } from "./test/scripted-vendor.ts";
import { serverSentEvents, wirePartialStream } from "./test/wire-replies.ts";

/** A provider in front of a fresh scripted vendor. The key is a made-up test value. */
function providerWith() {
  const vendor = new ScriptedVendor();
  const provider = new AnthropicProvider({
    id: "acme",
    http: vendor,
    key: async () => "test-key-1",
  });
  return { vendor, provider };
}

/** Reads a whole stream, and gives the pieces that arrived and what it failed with, if it did. */
async function readStream(provider: AnthropicProvider) {
  const events: ChatStreamEvent[] = [];
  try {
    for await (const event of provider.stream(chatRequest())) events.push(event);
  } catch (error) {
    return { events, error: error as Error };
  }
  return { events, error: undefined };
}

/** The vendor's own text on `error`'s cause, or undefined when it has none. */
function vendorTextOf(error: Error): string | undefined {
  return error.cause instanceof VendorErrorText ? error.cause.message : undefined;
}

/** Text shaped like an Anthropic key, built here so the source holds none. */
const keyShapedText = `sk-ant-${"Xy1".repeat(8)}`;

const errorEvent = (type: string, message: string) =>
  serverSentEvents([{ type: "error", error: { type, message } }]);

verifies("model-anthropic.stream", () => {
  it("asks the API to stream, at the same address and with the same headers as chat()", async () => {
    const { vendor, provider } = providerWith();
    vendor.answerNext(textAnswer);
    await readStream(provider);
    expect(vendor.received[0]).toMatchObject({
      url: "https://api.anthropic.com/v1/messages",
      redirect: "error",
      headers: { "anthropic-version": "2023-06-01", "x-api-key": "test-key-1" },
      body: { stream: true },
    });
  });
});

verifies("model-anthropic.stream-errors", () => {
  const partial = wirePartialStream("Hel");
  const cases: Array<
    [string, (vendor: ScriptedVendor) => void, ModelCallErrorReason, RegExp, string | undefined]
  > = [
    [
      "an overload after some text",
      (v) => v.streamNext(partial + errorEvent("overloaded_error", "Overloaded")),
      "provider-busy",
      /^acme was busy and couldn't take the call to the model "acme-small" \(overloaded_error\)$/,
      "Overloaded",
    ],
    [
      "an error event that holds something shaped like a key",
      (v) => v.streamNext(partial + errorEvent("api_error", `bad key ${keyShapedText}`)),
      "provider-busy",
      /\(api_error\)$/,
      undefined,
    ],
    [
      "an error event that holds the call's key",
      (v) => v.streamNext(partial + errorEvent("invalid_request_error", "sent test-key-1")),
      "refused",
      /^acme refused the call to the model "acme-small" \(invalid_request_error\)$/,
      undefined,
    ],
    [
      "an error event about the key",
      (v) => v.streamNext(partial + errorEvent("authentication_error", "invalid test-key-1")),
      "key-refused",
      /^acme didn't accept the key \(authentication_error\)$/,
      undefined,
    ],
    [
      "an error event of a type it doesn't know",
      (v) => v.streamNext(partial + errorEvent("surprise_error", "Something new")),
      "refused",
      /\(error event\)$/,
      "Something new",
    ],
    [
      "an error event with no type or text",
      (v) => v.streamNext(partial + serverSentEvents([{ type: "error" }])),
      "refused",
      /\(error event\)$/,
      undefined,
    ],
    [
      "a stream that ends before message_stop",
      (v) => v.streamNext(partial),
      "refused",
      /can't read/,
      undefined,
    ],
    [
      "event data that isn't JSON",
      (v) => v.streamNext("data: {\n\n"),
      "refused",
      /can't read/,
      undefined,
    ],
    [
      "a dropped connection",
      (v) => v.streamNext(partial, "drop"),
      "offline",
      /^Halonic couldn't reach acme at api.anthropic.com$/,
      undefined,
    ],
  ];
  for (const [what, script, reason, message, vendorText] of cases) {
    it(`ends with ${reason}, and no done, on ${what}`, async () => {
      const { vendor, provider } = providerWith();
      script(vendor);
      const { events, error } = await readStream(provider);
      expect(isModelCallError(error) && error.reason).toBe(reason);
      expect(error?.message).toMatch(message);
      expect(error === undefined ? undefined : vendorTextOf(error)).toBe(vendorText);
      expect(events.some((event) => event.type === "done")).toBe(false);
      expect(vendor.calls().open).toBe(0);
    });
  }

  // The status Anthropic documents for each error type, sent as a call error.
  const statusOfType: Array<[string, number]> = [
    ["invalid_request_error", 400],
    ["authentication_error", 401],
    ["billing_error", 402],
    ["permission_error", 403],
    ["not_found_error", 404],
    ["request_too_large", 413],
    ["rate_limit_error", 429],
    ["api_error", 500],
    ["timeout_error", 504],
    ["overloaded_error", 529],
  ];
  for (const [type, status] of statusOfType) {
    it(`gives the ${type} event the reason HTTP ${status} gets`, async () => {
      const wireError = { type, message: "Something went wrong" };
      const { vendor, provider } = providerWith();
      vendor.replyNext(status, { type: "error", error: wireError });
      vendor.streamNext(partial + errorEvent(type, wireError.message));
      const statusError = await provider.chat(chatRequest()).catch((thrown: unknown) => thrown);
      const { error: streamError } = await readStream(provider);
      expect(isModelCallError(statusError) && statusError.reason).not.toBe(false);
      expect(isModelCallError(streamError) && streamError.reason).toBe(
        isModelCallError(statusError) && statusError.reason,
      );
    });
  }

  it("gives the text that arrived before the API's error event", async () => {
    const { vendor, provider } = providerWith();
    vendor.streamNext(partial + errorEvent("overloaded_error", "Overloaded"));
    const { events } = await readStream(provider);
    expect(events).toEqual([{ type: "text", delta: "Hel" }]);
  });

  it("fails with the call error, before any piece, when the API refuses the call", async () => {
    const { vendor, provider } = providerWith();
    vendor.replyNext(529, {
      type: "error",
      error: { type: "overloaded_error", message: "Overloaded" },
    });
    const { events, error } = await readStream(provider);
    expect(events).toEqual([]);
    expect(isModelCallError(error) && error.reason).toBe("provider-busy");
    expect(error?.message).toMatch(/\(HTTP 529\)$/);
  });

  it("fails with the abort reason, not the API's error event, once the caller aborts", async () => {
    const { vendor, provider } = providerWith();
    vendor.streamNext(partial + errorEvent("overloaded_error", "Overloaded"));
    const controller = new AbortController();
    const reason = new Error("stopped by the test");
    const error = await (async () => {
      for await (const event of provider.stream(chatRequest(controller.signal))) {
        if (event.type === "text") controller.abort(reason);
      }
    })().catch((thrown: unknown) => thrown);
    expect(error).toBe(reason);
    expect(vendor.calls().open).toBe(0);
  });
});

verifies("model-anthropic.reply-size", () => {
  it("ends a stream with refused, and no done, once its reply passes 10 MiB", async () => {
    const { vendor, provider } = providerWith();
    vendor.floodNext();
    const { events, error } = await readStream(provider);
    expect(isModelCallError(error) && error.reason).toBe("refused");
    expect(error?.message).toMatch(
      /^acme's answer for the model "acme-small" was over 10 MB, more than Halonic reads$/,
    );
    expect(events).toEqual([]);
    expect(vendor.calls().open).toBe(0);
  });
});
