import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { AnthropicReplyReader } from "./anthropic-reply.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

verifies("harness-bridge.web", () => {
  it("reads a JSON reply's usage, split across chunks, on a runtime without Node's Buffer", () => {
    const reader = new AnthropicReplyReader();
    const reply = new TextEncoder().encode(
      JSON.stringify({
        content: [{ type: "text", text: "Grüße" }],
        usage: { input_tokens: 12, output_tokens: 3 },
      }),
    );
    reader.started(200, new Headers({ "content-type": "application/json" }));
    // Split inside the two bytes of "ü", so the text is decoded across chunks.
    const split = reply.indexOf(0xc3) + 1;
    reader.received(reply.subarray(0, split));
    reader.received(reply.subarray(split));

    // The Worker has no `Buffer`; reading a reply that isn't streamed must not need it. Taken
    // away only for the read, since the test runner itself needs it.
    vi.stubGlobal("Buffer", undefined);
    const reading = (() => {
      try {
        return reader.reading();
      } finally {
        vi.unstubAllGlobals();
      }
    })();

    expect(reading?.usage).toMatchObject({ inputTokens: 12, outputTokens: 3 });
    expect(reading?.text).toBe("Grüße");
  });
});
